import * as React from 'react';
import { StyleSheet, StatusBar, Image, Keyboard, Text, View, TouchableOpacity, Alert, TextInput, ScrollView, TouchableWithoutFeedback, Dimensions, Linking } from "react-native";
import LinearGradient from 'react-native-linear-gradient';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { AntDesign } from '@expo/vector-icons';
import { refreshAsync } from 'expo-auth-session';
import { Entypo } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { router } from 'expo-router';

function TimeDisplay({ style, milliseconds,}) {
    const formatTime = (ms) => {
        let totalSeconds = Math.floor(ms / 1000);
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = totalSeconds % 60;

        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <Text style={style}>{formatTime(milliseconds)}</Text>
    );
}

export default function Page() {


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // variables

    const [socket, setSocket] = React.useState(null);
    const [listUsers, setListUsers] = React.useState({ users: [], host: {} });
    const [theServerCode, setTheServerCode] = React.useState(null);
    const [countdown, setCountdown] = React.useState(null);
    const [votingPhase, setVotingPhase] = React.useState(false);
    const [searchParam, setSearchParam] = React.useState(null);
    const [songList, setSongList] = React.useState(null);
    const [songSelected, setSongSelected] = React.useState({ name: '', uri: '', artists: '' });
    const [votingList, setVotingList] = React.useState([]);
    const [songVoted, setSongVoted] = React.useState({ name: '', uri: '', artists: '' });
    const [isSearching, setSearching] = React.useState(false);
    const [showInfo, setShowInfo] = React.useState(false);
    const [currentSong, setCurrentSong] = React.useState({name: '', uri: '', image: '', artists: [], artistsURI: [], timestamp: 0});

    const insets = useSafeAreaInsets();



    
    const { height: deviceHeight, width: deviceWidth } = Dimensions.get('window');
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    const tokenEndpoint = 'https://accounts.spotify.com/api/token';
    const clientId = '43d48850732744018aff88a5692d03d5';
    let heartbeatInterval = null;
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // on mount functions

    // once user is directed to this page the app will connect them to the server
    // and then attempt to join the serverCode
    React.useEffect(() => {

        const newSocket = io(serverUrl);

        newSocket.on('connect', () => {
            console.log('Connected to server');
            joinServer(newSocket);

        });

        newSocket.on('userJoined', ({ userId }) => {
            console.log('User joined: ', userId);
            checkUserJoined(userId, newSocket);
        });

        newSocket.on('updateUsers', (data) => {
            console.log('Users updated: ', data);
            setListUsers(data);
        });

        newSocket.on('hostLeft', (data) => {
            console.log("Host left: ", data);
            hostLeft();
        });

        newSocket.on('hostTimedOut', (data) => {
            console.log("Host timed out: ", data);
            hostLeft();
        });

        newSocket.on("leaveError", (data) => {
            console.log("Leave error: ", data);
        });

        newSocket.on("joinError", (data) => {
            console.log("Join error: ", data);
            joinError();
        });

        newSocket.on("rejoinError", (data) => {
            console.log("Join error: ", data);
            rejoin(newSocket);
        });

        newSocket.on("serverFull", () => {
            console.log("Server is full");
            serverFull();
        });

        newSocket.on('countdownUpdate', ({ timerIndex, remainingTime }) => {
            if (remainingTime === 0) {
                setCountdown(null);
            } else {
                setCountdown(remainingTime / 1000);
            }

            if (timerIndex === 0) {
                setVotingPhase(false);
            } else {
                setVotingPhase(true);
                
            }

        });

        newSocket.on("userTimedOut", ({ userId }) => {
            checkTimeOut(userId);
        });

        newSocket.on("heartbeatReceived", (data) => {
            console.log("Heartbeat received: ", data);
        });

        newSocket.on("requestedSongs", ({songs}) => {
            setVotingList(songs);
        });

        newSocket.on('currentSongInfo', ({songInfo}) => {
            // console.log(songInfo);
            setCurrentSong(songInfo);
        });

        setSocket(newSocket);

        return () => {
            clearInterval(heartbeatInterval);
            newSocket.disconnect();
        };
    }, [])

    React.useEffect(() => {
        setShowInfo(false);

        if (votingPhase) {
            setSearching(false);

            if (songSelected.uri !== '') {
                setSongList(null);
                setSearchParam(null);
                sendSongRequest();
                // setSongVoted({ song: '', uri: '', artists: '' });
            }
        } else {
            // setSongSelected({ song: '', uri: '', artists: '' });
            setVotingList([]);
            sendVotes();
        }

    }, [votingPhase]);
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // other functions

    // function to get the values from async storage
    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // join and leave functions

    // if the user is not rejoining a server it will attempt to join a server using the code they entered
    // if the user is rejoining a server it will attempt to rejoin the server they were in before
    const joinServer = async (socket) => {
        const username = await getValue("username");
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");
        const rejoin = await getValue("rejoining");
        await AsyncStorage.setItem("hosting", "false");
        
        if (serverCode || rejoin === "true") {
            console.log("User Reconnected to ", serverCode);
            setTheServerCode(serverCode);

            socket.emit('updateUser', { username: username, userId: userId, serverCode: serverCode });
        } else {
            if (serverCode !== null) {
                setTheServerCode(serverCode);
            }
    
            socket.emit('joinServer', { serverCode: serverCode, username: username, userId: userId });
        }
    };

    // if the user was disconnected from the server but still tried to rejoin
    // it will attempt to join the server normally but it may fail if the server became full or closed
    const rejoin = async (socket) => {
        const username = await getValue("username");
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");
        await AsyncStorage.setItem("hosting", "false");

        if (serverCode !== null) {
            setTheServerCode(serverCode);
        }

        socket.emit('joinServer', { serverCode: serverCode, username: username, userId: userId });
    };

    // once a user joins a server this function is called to check the user id of the member that joined
    // if the user id matches the current user's id then it will start the heartbeat 
    const checkUserJoined = async (userId, newSocket) => {
        const myUserId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        if (userId === myUserId) {
            heartbeatInterval = setInterval(() => {sendHeartbeat(newSocket, serverCode)}, 60000);
        }
    };

    // function that allows user to leave the server by disconnecting them and removing any data related to the server
    // does not prompt for rejoin if this path is taken
    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");

        router.replace('/home');
    };

    // function is called if a host left the server
    // removes any data associated with server
    // does not prompt for rejoin if this path is taken
    const hostLeft = async () => {
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
        router.replace('/home');
    };

    // function is called if the server was full at join
    // removes any data associated with the server and does not prompt for rejoin
    const serverFull = async () => {
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");

        Alert.alert(
            'Server Full',
            'The server you are trying to join is currently full right now. Please try again later. Thank you.',
            [
                { text: 'OK' }
            ],
            { cancelable: false }
        );

        router.replace('/home');
    };

    // function is called if there was an error while joining
    // removes any data associated with server
    // does not prompt for rejoin
    const joinError = async () => {
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");

        Alert.alert(
            'Join Error',
            'The server you are trying to join is does not exist.',
            [
                { text: 'OK' }
            ],
            { cancelable: false }
        );

        router.replace('/home');
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // api functions

    // validates the access token of the user
    const validateAuth = async () => {
        const accessToken = await getValue("accessToken");
        const expiration = await getValue("expiration");
        let expirationTime = parseInt(expiration, 10);
        let currentTime = new Date().getTime();

        if (accessToken) {
            if (currentTime >= expirationTime) {
                // do refresh path
                refreshAccessToken();
            }
        } else {
            // do login path
            const userId = await getValue("userId");
            const serverCode = await getValue("serverCode");

            socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

            await AsyncStorage.removeItem("serverCode");
            await AsyncStorage.removeItem("accessToken");
            await AsyncStorage.setItem("hosting", "false");
            await AsyncStorage.setItem("rejoining", "false");

            Alert.alert(
                'Authentication Error',
                'We were not able to authenticate your Spotify account. Please login again. Thank you.',
                [
                    { text: 'OK' }
                ],
                { cancelable: false }
            );

            router.replace('/');
        }
    };

    // function that will try to refresh the access token with spotify
    const refreshAccessToken = async () => {

        try {

            const refreshToken = await getValue("refreshToken");

            const refreshResponse = await refreshAsync(
                {
                    extraParams: {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        grant_type: "refresh_token",
                    },
                    clientId: clientId,
                    refreshToken: refreshToken,
                },
                {
                    tokenEndpoint: tokenEndpoint,
                }
            );

            const expirationTime = new Date().getTime() + refreshResponse.expiresIn * 1000;
            await AsyncStorage.setItem('accessToken', refreshResponse.accessToken);
            await AsyncStorage.setItem('refreshToken', refreshResponse.refreshToken);
            await AsyncStorage.setItem('expiration', expirationTime.toString());

        } catch (error) {
            // do login path
            const userId = await getValue("userId");
            const serverCode = await getValue("serverCode");

            socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

            await AsyncStorage.removeItem("serverCode");
            await AsyncStorage.removeItem("accessToken");
            await AsyncStorage.setItem("hosting", "false");
            await AsyncStorage.setItem("rejoining", "false");

            Alert.alert(
                'Authentication Error',
                'We were not able to authenticate your Spotify account. Please login again. Thank you.',
                [
                    { text: 'OK' }
                ],
                { cancelable: false }
            );

            router.replace('/');
        }

    };

    // function that allows user to search for songs within spotify using spotify api
    const searchSong = async () => {

        if (searchParam) {

            // verify accessToken and if not valid refresh it
            await validateAuth();

            const accessToken = await getValue("accessToken");
            const url = `https://api.spotify.com/v1/search?q=${searchParam}&type=track&market=US`;

            const spotifySearchParams = {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            };

            await fetch(url, spotifySearchParams)
                .then((response) => response.json())
                .then((data) => {
                    const songs = data.tracks.items.map(item => ({
                        name: item.name,
                        uri: item.uri,
                        isPlayable: item.is_playable,
                        artist: item.artists.map(artistItems => artistItems.name),
                        image: item.album.images[0].url
                    }))

                    setSongList(songs);

                })
                .catch((error) => {
                    console.error("Search error: ", error);
                })
        } else {

            setSearchParam(null);
            setSongList(null);
        }
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // time out functions

    // function that checks the userId of a timedout user
    // if the userId is the current user's id then it will remove any data associated with server
    // user will be disconnected from the server
    // will allow user to rejoin
    const checkTimeOut = async (userId) => {
        const myUserId = await getValue("userId");

        if (myUserId === userId) {
            // disconnect

            await AsyncStorage.removeItem("serverCode");
            await AsyncStorage.setItem("hosting", "false");
            await AsyncStorage.setItem("rejoining", "true");

            router.replace('/home');
        }
    };

    // function that sends a heartbeat to the server to make sure user does not timeout
    const sendHeartbeat = async (socket, serverCode) => {
        const userId = await getValue("userId");
        console.log("Sending heartbeat");
        socket.emit("heartbeat", { serverCode: serverCode, userId: userId });
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // song request and voting functions

    // function that allows user to submit a song request
    // the song request will be taken to a voting phase for users to vote on one song
    // song winner will be added to the host's queue
    const sendSongRequest = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        if (socket) {
            console.log("Sending request");
            // setSongVoted({song: '', artists: '', uri: songSelected.uri});
            socket.emit("songRequest", { serverCode: serverCode, userId: userId, songInfo: songSelected});
        }
    };

    const sendVotes = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        console.log("Voting: ", songVoted);
        console.log("Voting: ", songSelected);

        if (socket) {
            console.log("Sending vote");
            if (songVoted.uri !== '') {
                socket.emit("songVote", { serverCode: serverCode, userId: userId, songInfo: songVoted, voted: true});
            } else {
                socket.emit("songVote", { serverCode: serverCode, userId: userId, songInfo: songSelected, voted: false});
            }
        }

        setSongVoted({ song: '', uri: '', artists: '' });
        setSongSelected({ song: '', uri: '', artists: '' });
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // styles
    const styles = StyleSheet.create({
        container: {
            flex: 1,
            padding: 0,
            margin: 0,
            top: 0,
            bottom: 0,
            zIndex: 1
        },
        search: {
            flex: isSearching ? 1 : 0,
            flexDirection: 'column',
            alignItems: 'center',
            // marginTop: 5
        },
        searchInput: {
            flex: 0,
            width: '100%',
            flexDirection: 'row',
        },
        searchOutput: {
            flex: isSearching ? 1 : 0,
            width: '100%',
            paddingHorizontal: 5,
            marginTop: 5
        },
        searchList: {
            flexDirection: 'row',
        },
        searchSongInfo: {
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingLeft: 10
        },
        backButton: {
            flex: 0,
            fontWeight: "bold",
            fontSize: 25,
            color: "blue",
        },
        leaveButton: {
            fontWeight: "bold",
            fontSize: 25,
            color: "blue",
            alignItems: 'center'
        },
        input: {
            height: 40,
            width: '60%',
            paddingLeft: 15,
            fontSize: 15,
            borderColor: '#7D00D1',
            borderRadius: 25,
            borderWidth: 1,
            color: 'white',
            justifyContent: 'center',
            alignContent: 'center'
        },
        serverInfo: {
            flex: 0,
            marginTop: 10,
            flexDirection: 'column',
            alignItems: 'center',
        },
        songSelected: {
            fontWeight: 'bold',
            fontSize: 20,
            color: "white",
            marginBottom: 30
        },
        serverCode: {
            fontWeight: 'bold',
            fontSize: 23,
            color: "white",
            marginBottom: 30,
        },
        song: {
            flex: isSearching ? 0 : 1,
            flexDirection: 'column',
            alignItems: 'center'
        },
        songInfo: {
            flex: 0,
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 15,
            // marginBottom: 2
        },
        songName: {
            color: 'white',
            fontSize: 17,
            fontWeight: 'bold'
        },
        artist: {
            color: 'white',
            fontSize: 13,
            fontWeight: 'bold'
        },
        button: {
            fontWeight: "bold",
            paddingHorizontal: 15,
            alignItems: 'center',
            justifyContent: 'center',
        },
        image: {
            width: .85 * deviceWidth,
            height: .85 * deviceWidth,
            marginTop: 25,
            marginBottom: 0
        },
        info: {
            flex: 0,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 5,
        },
        infoHeader: {
            color: '#7D00D1',
            fontSize: 35,
            fontWeight: "bold",
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf:'center'
        },
        hostLabel: {
            fontWeight: 'bold',
            fontSize: 22,
            color: "#7D00D1",
            marginBottom: 5
        },
        membersLabel: {
            fontWeight: 'bold',
            fontSize: 22,
            color: "#7D00D1",
            marginTop: 25,
            marginBottom: 5
        },
        users: {
            color: "white",
            fontSize: 18
        },
        alertContainer: {
            position: 'absolute',
            top: '12%',
            left: '32%',
            width: 150,
            backgroundColor: 'rgba(148, 148, 148, 1)',
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2
          },
          alertText: {
            fontSize: 20,
            alignItems: 'center',
            justifyContent: 'center',
          },
          voteInfo: {
            color: 'white',
            fontSize: 18,
            marginBottom: 50,
          },
    });
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // screen

    // displays the server code, a countdown for the current phase, the current phase,
    //  a song search textbox, a search button for songs, a list of songs from the search,
    //  and a leave server button
    return (
        <LinearGradient
            colors={['rgb(31, 31, 31)', 'rgb(31, 31, 31)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.container}
        >
            <SafeAreaView style={styles.container}>
                <StatusBar barStyle='light-content' />

                <TouchableWithoutFeedback style={styles.container} onPress={() => {
                    if (isSearching) {
                        Keyboard.dismiss()
                    }
                }}>
                    <>

                        {!showInfo ? (
                            <View style={styles.container}>
                                {theServerCode && (
                                    <>
                                        <View style={styles.search}>
                                            <View style={styles.searchInput}>
                                                {isSearching && (
                                                    <TouchableOpacity style={{ paddingLeft: insets.left, paddingRight: 10, width: '20%', justifyContent: 'center', alignItems: 'center' }} onPress={() => {
                                                        setSearching(false);
                                                        setSearchParam(null);
                                                        setSongList(null);
                                                        Keyboard.dismiss();
                                                    }}>
                                                        <Ionicons name="arrow-back" size={40} color="#7D00D1" />
                                                    </TouchableOpacity>
                                                )}

                                                {!isSearching && (
                                                    <TouchableOpacity style={{ paddingLeft: insets.left, paddingRight: 10, width: '20%', justifyContent: 'center', alignItems: 'center' }} onPress={async () => await leaveServer()}>
                                                        <MaterialIcons name="exit-to-app" size={40} color="#7D00D1" />
                                                    </TouchableOpacity>
                                                )}

                                                {!votingPhase && (
                                                    <TextInput
                                                        style={styles.input}
                                                        placeholder="Search for a song"
                                                        placeholderTextColor={'white'}
                                                        value={searchParam}
                                                        onChangeText={setSearchParam}
                                                        keyboardAppearance='dark'
                                                        returnKeyType='search'
                                                        onSubmitEditing={() => searchSong()}
                                                        onFocus={() => setSearching(true)}
                                                    />
                                                )}
                                                

                                                
                                            </View>

                                            {!isSearching ? (
                                                    <TouchableOpacity style={{ paddingLeft: 10, paddingRight: 10, position: 'absolute', justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-end' }} onPress={async () => setShowInfo(true)}>
                                                        <Ionicons name="information-circle-outline" size={40} color="#7D00D1" />
                                                    </TouchableOpacity>
                                                ) : (
                                                    <TouchableOpacity style={{ paddingLeft: 10, paddingRight: insets.right, position: 'absolute', alignItems: 'flex-end', alignSelf: 'flex-end' }} onPress={async () => setShowInfo(true)}>
                                                        <Ionicons name="information-circle-outline" size={40} color="#7D00D1" />
                                                    </TouchableOpacity>
                                            )}

                                            <View style={styles.searchOutput}>
                                                {isSearching && (
                                                    <ScrollView style={styles.searchOutput}>
                                                        {songList && songList.map(item => (
                                                            <TouchableOpacity key={item.uri} style={{flexDirection: 'row', marginTop: 13}}>
                                                                <TouchableOpacity style={{flexDirection: 'row', width: '90%'}} onPress={() => {
                                                                        if (item.uri === songSelected.uri) {
                                                                            setSongSelected({ name: '', uri: '', artists: '' });
                                                                        } else {
                                                                            setSongSelected(item); 
                                                                        }
                                                                    }}>
                                                                    <View>
                                                                        <Image style={{width: 55, height: 55}} source={{ uri: item.image }} />
                                                                    </View>
                                                                    <View style={styles.searchSongInfo}>
                                                                        <Text style={{ fontSize: 18, color: "white", alignItems: 'flex-start' }}>{
                                                                        item.name.length <= 25
                                                                        ? item.name
                                                                        : item.name.slice(0, 25) + '...'
                                                                        }</Text>
                                                                        <Text style={{ fontSize: 15, color: "white", alignItems: 'flex-start' }}>{
                                                                            item.artist.length <= 2
                                                                            ? item.artist.join(', ')
                                                                            : item.artist.slice(0, 2).join(', ') + ', ...'
                                                                        }</Text>
                                                                    </View>
                                                                </TouchableOpacity>
                                                                
                                                                { songSelected.uri === item.uri ? (
                                                                    <Entypo style={{alignSelf: 'center', alignItems: 'center', justifyContent: 'center'}} name="check" size={24} color="#7D00D1" />
                                                                ) : (
                                                                    <Text></Text>
                                                                )}

                                                            </TouchableOpacity>
                                                        ))}
                                                    </ScrollView>
                                                )}
                                            </View>
                                        </View>
                                        <View>
                                            {!votingPhase && !isSearching && (
                                                <Text style={{alignSelf: 'center', fontWeight: 'bold', color: 'white', fontSize: 15, marginBottom: 5}}><Text style={{color: "#7D00D1", fontSize: 20}}>Your Song: </Text>{
                                                    songSelected.name ? songSelected.name.length <= 15 ? songSelected.name : songSelected.name.slice(0, 15) + '...' : 'N/A'
                                                    }</Text>
                                            )}
                                        </View>
                                        
                                        {/* <> */}
                                            {!isSearching && !votingPhase && (
                                                <View style={styles.serverInfo}>
                                                    
                                                        <Text style={{fontWeight: 'bold', color: '#7D00D1', fontSize: 20, marginBottom: 5}}>{votingPhase ? 'Vote for a song!' : 'Search for a song!'}</Text>
                                                        <Text style={{fontWeight: 'bold', color: 'white', fontSize: 17, marginBottom: 0}}>{countdown} Seconds</Text>
                                                </View>
                                            )}
                                            {!isSearching && votingPhase && (
                                                <>
                                                <View style={{marginTop: 5, position: 'absolute', justifyContent: 'center', alignSelf: 'center'}}>
                                                        <Text style={{alignSelf: 'center', fontWeight: 'bold', color: '#7D00D1', fontSize: 20, marginBottom: 5}}>{votingPhase ? 'Vote for a song!' : 'Search for a song!'}</Text>
                                                        <Text style={{alignSelf: 'center', fontWeight: 'bold', color: 'white', fontSize: 17, marginBottom: 0}}>{countdown} Seconds</Text>
                                                        <Text style={{alignSelf: 'center', fontWeight: 'bold', color: 'white', fontSize: 20, marginBottom: 5, marginTop: 20}}><Text style={{color: "#7D00D1", fontSize: 20}}>Your Song: </Text>{
                                                        songSelected.name ? songSelected.name.length <= 15 ? songSelected.name : songSelected.name.slice(0, 15) + '...' : 'N/A'
                                                        }</Text>
                                                </View>

                                                <View style={{marginTop: 100, justifyContent: 'center', alignSelf: 'center'}}>
                                                    {votingList && votingList.map((item, index) => (
                                                        <>
                                                        <Text key={index} style={styles.voteInfo}>
                                                            {item.name.length < 15 ? item.name : item.name.slice(0, 15) + '...'}
                                                        </Text>

                                                        <Text key={index} style={styles.voteInfo}>
                                                            {item.name.length < 15 ? item.name : item.name.slice(0, 15) + '...'}
                                                        </Text>

                                                        <Text key={index} style={styles.voteInfo}>
                                                        {item.name.length < 15 ? item.name : item.name.slice(0, 15) + '...'}
                                                        </Text>

                                                        <Text key={index} style={styles.voteInfo}>
                                                                {item.name}
                                                        </Text>

                                                        <Text key={index} style={styles.voteInfo}>
                                                        {item.name.length < 15 ? item.name : item.name.slice(0, 15) + '...'}
                                                        </Text>
                                                        </>
                                                    ))}
                                                </View>
                                                </>
                                            )}
                                        {/* </> */}


                                        <View style={styles.song}>
                                            {!isSearching && !votingPhase && (
                                                <>
                                                    {currentSong.uri !== '' ? (
                                                        <>
                                                            <TouchableWithoutFeedback onPress={() => Linking.openURL(currentSong.uri)}>
                                                                <Image source={{ uri: currentSong.image }} style={styles.image}></Image>
                                                            </TouchableWithoutFeedback>

                                                            <View style={styles.songInfo}>
                                                                <TouchableWithoutFeedback onPress={() => Linking.openURL(currentSong.uri)}>
                                                                    <Text style={styles.songName}>{
                                                                    currentSong.name.length <= 40
                                                                    ? currentSong.name
                                                                    : currentSong.name.slice(0, 40) + '...'
                                                                    }</Text>
                                                                </TouchableWithoutFeedback>

                                                                <TouchableWithoutFeedback onPress={() => Linking.openURL(currentSong.artistsURI[0])}>
                                                                    <Text style={styles.artist}>{
                                                                    currentSong.artists.length <= 3
                                                                    ? currentSong.artists.join(", ")
                                                                    : currentSong.artists.slice(0, 3).join(', ') + ', ...'}</Text>
                                                                </TouchableWithoutFeedback>
                                                                
                                                                <View style={{ alignItems: 'center', flexDirection: 'row', transform: [{scaleX: 0.4}, {scaleY: 0.4}]}}>
                                                                    <TimeDisplay style={{color: 'white', fontSize: 30, fontWeight: '500', paddingHorizontal: 10}} milliseconds={currentSong.timestamp}/>
                                                                    <Slider
                                                                        style={{ margin: 0, padding: 0, width: 725, height: 50}}
                                                                        minimumValue={0}
                                                                        maximumValue={currentSong.duration}
                                                                        value={currentSong.timestamp}
                                                                        minimumTrackTintColor="#FFFFFF"
                                                                        maximumTrackTintColor="#5E5E5E"
                                                                        step={1}
                                                                        disabled={true}
                                                                        
                                                                    />
                                                                    <TimeDisplay style={{color: 'white', fontSize: 30, fontWeight: '500', paddingHorizontal: 10}} milliseconds={currentSong.duration}/>
                                                                </View>
                                                            </View>
                                                        </>
                                                    ) : (

                                                        <>
                                                            <TouchableWithoutFeedback onPress={() => Linking.openURL("spotify://")}>
                                                                <Image source={require('../images/spotify-icon.png')} style={styles.image} />
                                                            </TouchableWithoutFeedback>

                                                            <View style={styles.songInfo}>
                                                                <Text style={styles.songName}>Spotify not Playing</Text>
                                                                <Text style={styles.artist}>Please Tell Host to Play Spotify</Text>
                                                            </View>
                                                        </>

                                                    )}

                                                </>
                                            )}
                                        </View>
                                    </>
                                )}
                            </View>
                        ) : (
                            <View style={styles.container}>

                                <TouchableOpacity
                                    style={{ position: 'absolute', paddingLeft: 10, paddingRight: 10, left: 0, justifyContent: 'center', alignItems: 'center' }}
                                    onPress={() => setShowInfo(false)}>
                                    <Ionicons name="arrow-back" size={40} color="#7D00D1" />
                                </TouchableOpacity>

                                <Text style={styles.infoHeader}>Server Info</Text>

                                <View style={styles.serverInfo}>
                                    <Text style={styles.serverCode}><Text style={{color: "#7D00D1", fontSize: 28}}>Code: </Text>{theServerCode}</Text>

                                    <Text style={styles.hostLabel}>Host:</Text>

                                    {listUsers.host && (
                                        <Text style={styles.users}>{listUsers.host.username}</Text>
                                    )}

                                    <Text style={styles.membersLabel}>Members: </Text>
                                    {listUsers.users && listUsers.users.map((user, index) => (
                                        <Text style={styles.users} key={index}>{user.username}</Text>
                                    ))}
                                </View>
                            </View>
                        )}
                    
                    </>
                </TouchableWithoutFeedback>
            </SafeAreaView>
        </LinearGradient>
        
    );
    /////////////////////////////////////////////////////////////////////////////////////////////////
}