import * as React from 'react';
import { StyleSheet, StatusBar, Modal, Text, View, useColorScheme, TouchableOpacity, Alert, TextInput, ScrollView, Image, TouchableWithoutFeedback, Keyboard, Dimensions, Linking } from "react-native";
import { Slider } from "@miblanchard/react-native-slider";
import { MaterialIcons } from '@expo/vector-icons';
import { SimpleLineIcons } from '@expo/vector-icons';
import { Entypo } from '@expo/vector-icons';
import { refreshAsync } from 'expo-auth-session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    const [showInfo, setShowInfo] = React.useState(false);
    const [currentSong, setCurrentSong] = React.useState({name: '', uri: '', image: '', artists: [], artistsURI: [], timestamp: 0});
    const [connected, setConnected] = React.useState(false);

    const [isSearching, setSearching] = React.useState(false);
    const searchBarRef = React.useRef(null);

    const insets = useSafeAreaInsets();
	const theme = useColorScheme();
    const { height, width } = Dimensions.get('window');
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    const tokenEndpoint = 'https://accounts.spotify.com/api/token';
    const clientId = '43d48850732744018aff88a5692d03d5';
    let heartbeatInterval = null;

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // on mount functions

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
            }
        } else {
            setVotingList([]);
            sendVotes();
        }

    }, [votingPhase]);

    React.useEffect(() => {
        if (isSearching) {
            searchBarRef.current.focus();
        }
    }, [isSearching])

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // other functions

    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };
    
    const sliceData = (data, minSlice, isArray) => {
        if (data.length > minSlice) {
            if (isArray) {
                return data.slice(0, minSlice).join(', ') + ', ...';
            } else {
                return data.slice(0, minSlice) + ' ...';
            }
            
        } else {
            if (isArray) {
                return data.join(', ');
            } else {
                return data;
            }
        }
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // join and leave functions

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

    const checkUserJoined = async (userId, newSocket) => {
        const myUserId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        if (userId === myUserId) {
            setConnected(true);
            heartbeatInterval = setInterval(() => {sendHeartbeat(newSocket, serverCode)}, 60000);
        }
    };

    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

        setConnected(false);
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");

        router.replace('/');
    };

    const askLeave = async () => {
        Alert.alert(
            "Leave Session?",
            "Leaving will not end the session.",
            [
                {
                    text: "No",
                    style: "cancel",
                    onPress: () => {
                        
                    },
                },
                {
                    text: "Yes",
                    onPress: async () => {
                        await leaveServer();
                    },
                },
            ],
            { cancelable: false }
        );
    };

    const hostLeft = async () => {
        setConnected(false);
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
        router.replace('/');
    };

    const serverFull = async () => {
        setConnected(false);
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

        router.replace('/');
    };

    const joinError = async () => {
        setConnected(false);
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

        router.replace('/');
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // api functions

    const validateAuth = async () => {
        const accessToken = await getValue("accessToken");
        const expiration = await getValue("expiration");
        let expirationTime = parseInt(expiration, 10);
        let currentTime = new Date().getTime();

        if (accessToken) {
            if (currentTime >= expirationTime) {
                refreshAccessToken();
            }
        } else {
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

    const searchSong = async () => {

        if (searchParam) {

            await validateAuth();

            const accessToken = await getValue("accessToken");
            const url = `https://api.spotify.com/v1/search?q=${searchParam}&type=track&market=US&limit=50`;

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
    // time out functions

    const checkTimeOut = async (userId) => {
        const myUserId = await getValue("userId");

        if (myUserId === userId) {
            setConnected(false);
            await AsyncStorage.removeItem("serverCode");
            await AsyncStorage.setItem("hosting", "false");
            await AsyncStorage.setItem("rejoining", "true");

            router.replace('/');
        }
    };

    const sendHeartbeat = async (socket, serverCode) => {
        const userId = await getValue("userId");
        console.log("Sending heartbeat");
        socket.emit("heartbeat", { serverCode: serverCode, userId: userId });
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // song request and voting functions

    const sendSongRequest = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        if (socket) {
            console.log("Sending request");
            socket.emit("songRequest", { serverCode: serverCode, userId: userId, songInfo: songSelected});
        }
    };

    const sendVotes = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

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
    // styles
    // const styles = StyleSheet.create({
    //     container: {
    //         flex: 1,
    //         padding: 0,
    //         margin: 0,
    //         top: 0,
    //         bottom: 0,
    //         zIndex: 1
    //     },
    //     search: {
    //         flex: isSearching ? 1 : 0,
    //         flexDirection: 'column',
    //         alignItems: 'center',
    //     },
    //     searchInput: {
    //         flex: 0,
    //         width: '100%',
    //         flexDirection: 'row',
    //     },
    //     searchOutput: {
    //         flex: isSearching ? 1 : 0,
    //         width: '100%',
    //         paddingHorizontal: 5,
    //         marginTop: 5
    //     },
    //     searchList: {
    //         flexDirection: 'row',
    //     },
    //     searchSongInfo: {
    //         flexDirection: 'column',
    //         justifyContent: 'center',
    //         alignItems: 'flex-start',
    //         paddingLeft: 10,
    //     },
    //     backButton: {
    //         flex: 0,
    //         fontWeight: "bold",
    //         fontSize: 25,
    //         color: "blue",
    //     },
    //     leaveButton: {
    //         fontWeight: "bold",
    //         fontSize: 25,
    //         color: "blue",
    //         alignItems: 'center'
    //     },
    //     input: {
    //         height: 40,
    //         width: '60%',
    //         paddingLeft: 15,
    //         fontSize: 15,
    //         borderColor: '#7D00D1',
    //         borderRadius: 25,
    //         borderWidth: 1,
    //         color: theme === 'light' ? 'black' : 'white',
    //         justifyContent: 'center',
    //         alignContent: 'center'
    //     },
    //     serverInfo: {
    //         flex: 0,
    //         marginTop: 10,
    //         flexDirection: 'column',
    //         alignItems: 'center',
    //     },
    //     songSelected: {
    //         fontWeight: 'bold',
    //         fontSize: 20,
    //         color: theme === 'light' ? 'black' : 'white',
    //         marginBottom: 30
    //     },
    //     serverCode: {
    //         fontWeight: 'bold',
    //         fontSize: 23,
    //         color: theme === 'light' ? 'black' : 'white',
    //         marginBottom: 30,
    //     },
    //     song: {
    //         flex: isSearching ? 0 : 1,
    //         flexDirection: 'column',
    //         alignItems: 'center'
    //     },
    //     songInfo: {
    //         flex: 0,
    //         flexDirection: 'column',
    //         alignItems: 'center',
    //         marginTop: 15,
    //     },
    //     songName: {
    //         color: theme === 'light' ? 'black' : 'white',
    //         fontSize: 17,
    //         fontWeight: 'bold'
    //     },
    //     artist: {
    //         color: theme === 'light' ? 'black' : 'white',
    //         fontSize: 13,
    //         fontWeight: 'bold'
    //     },
    //     button: {
    //         fontWeight: "bold",
    //         paddingHorizontal: 15,
    //         alignItems: 'center',
    //         justifyContent: 'center',
    //     },
    //     image: {
    //         width: .85 * deviceWidth,
    //         height: .85 * deviceWidth,
    //         marginTop: 25,
    //         marginBottom: 0
    //     },
    //     info: {
    //         flex: 0,
    //         width: '100%',
    //         flexDirection: 'row',
    //         alignItems: 'center',
    //         marginTop: 5,
    //     },
    //     infoHeader: {
    //         color: '#7D00D1',
    //         fontSize: 35,
    //         fontWeight: "bold",
    //         justifyContent: 'center',
    //         alignItems: 'center',
    //         alignSelf:'center'
    //     },
    //     hostLabel: {
    //         fontWeight: 'bold',
    //         fontSize: 22,
    //         color: "#7D00D1",
    //         marginBottom: 5
    //     },
    //     membersLabel: {
    //         fontWeight: 'bold',
    //         fontSize: 22,
    //         color: "#7D00D1",
    //         marginTop: 25,
    //         marginBottom: 5
    //     },
    //     users: {
    //         color: theme === 'light' ? 'black' : 'white',
    //         fontSize: 18
    //     },
    //     alertContainer: {
    //         position: 'absolute',
    //         top: '12%',
    //         left: '32%',
    //         width: 150,
    //         backgroundColor: 'rgba(148, 148, 148, 1)',
    //         borderRadius: 10,
    //         alignItems: 'center',
    //         justifyContent: 'center',
    //         zIndex: 2
    //       },
    //       alertText: {
    //         fontSize: 20,
    //         alignItems: 'center',
    //         justifyContent: 'center',
    //       },
    //       voteInfoSong: {
    //         color: theme === 'light' ? 'black' : 'white',
    //         fontSize: 18,
    //       },
    //       voteInfoArtist: {
    //         color: theme === 'light' ? 'black' : 'white',
    //         fontSize: 15,
    //         marginBottom: 50,
    //       },
    // });

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            backgroundColor: theme === 'light' ? '#FFFFFF' : '#242424',
        },
        header: {
            flexDirection: 'row',
            paddingTop: insets.top,
            marginLeft: insets.left, 
            marginRight: insets.right, 
            alignItems: 'center',
            width: '100%',
            borderBottomWidth: 1,
            borderColor: theme === 'light' ? 'black' : 'white',
            paddingBottom: "3%",
            backgroundColor: theme === 'light' ? '#FFFFFF': '#242424',
            shadowColor: theme == 'light' ? 'black' : 'white',
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: {
            width: 0,
            height: 5,
            },
            elevation: 5
        },
        exitButton: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 10,
        },
        searchBar: {
            flex: 7,
            justifyContent: 'center',
            alignContent: 'center',
            paddingLeft: 15,
            paddingVertical: 5,
            fontSize: 20,
            borderColor: theme === 'light' ? 'black' : 'white',
            borderRadius: 25,
            borderWidth: 1,
            color: theme === 'light' ? 'black' : 'white',
            
        },
        infoButton: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 10,
        },
        searchList: {
            flex: 1,
            width: '100%',
            paddingHorizontal: '1%',
            paddingVertical: '1%',
        },
        searchSongInfo: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            paddingHorizontal: '1%',
            paddingVertical: '1%',
        },
        smallAlbumCover: {
            width: 0.125 * width,
            height: 0.125 * width,
        },
        songInfo: {
            flexDirection: 'column',
            paddingHorizontal: '5%'
        },
        main: {
            flex: 1,
            width: '100%',
            justifyContent: 'space-between'
        },
        playback: {
            flex: 1,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
        },
        albumCover: {
            width: 0.8 * width,
            height: 0.8 * width,
        },
        albumCoverShadow: {
            backgroundColor: theme === 'light' ? '#FFFFFF': '#242424',
            shadowColor: theme == 'light' ? 'black' : 'white',
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: {
            width: 0,
            height: 0,
            },
            elevation: 5
        },
        playbackInfo: {
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            marginTop: '3%'
        },
        slider: { 
            width: '80%'
        },
        sliderInfo: {
            marginTop: '-3%',
            width: '80%',
            flexDirection: "row",
            justifyContent: 'space-between'
        },
        playbackControls: {
            paddingHorizontal: '20%',
            marginTop: '5%', 
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%'
        },
        queueCard: {
            alignSelf: 'center',
            justifyContent: 'center',
            alignItems: 'center',
            height: '7%',
            width: '90%',
            borderTopStartRadius: 15,
            borderTopEndRadius: 15,
            backgroundColor: theme === 'light' ? '#ebebeb' : '#1c1c1c',
            ...Platform.select({
                ios: {
                  shadowColor: theme == 'light' ? '#000' : '#888',
                  shadowOpacity: 0.5,
                  shadowRadius: 10,
                  shadowOffset: {
                    width: 0,
                    height: -5,
                  },
                },
                android: {
                  elevation: 5,
                },
            }),
        },
        thumb: {
            backgroundColor: theme === 'light' ? 'black' : 'white',
            borderRadius: 10 / 2,
            width: 0,
            height: 0,
        },
    });


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // screen

    if (isSearching) { 
        return (
            <TouchableWithoutFeedback activeOpacity={1} style={styles.container}>
                <View style={styles.container}>
                    <StatusBar />

                    {/* <Modal
                        animationType="fade"
                        transparent={true}
                        visible={queueAlert}
                        onShow={() => setTimeout(() => setQueueAlert(!queueAlert), 750)}
                    >
                        <View style={styles.queueAlert}>
                            <MaterialIcons name="queue" size={50} color={theme === 'light' ? 'white' : 'black'} />
                            <Text style={{color: theme === 'light' ? 'white' : 'black'}}>Song Queued!</Text>
                        </View>
                    </Modal> */}

                    <View style={styles.header} >
                        <TouchableOpacity style={styles.exitButton} onPress={() => {setSearching(false); setSearchParam(null); setSongList(null); Keyboard.dismiss();}} >
                            <MaterialIcons name="arrow-back" size={35} color={theme === 'light' ? 'black' : 'white'} />
                        </TouchableOpacity>

                        <TextInput
                            style={styles.searchBar}
                            ref={searchBarRef}
                            placeholder='Search...'
                            placeholderTextColor={theme === 'light' ? 'black' : 'white'}
                            value={searchParam}
                            onChangeText={setSearchParam}
                            keyboardAppearance={theme}
                            returnKeyType='search'
                            onSubmitEditing={() => searchSong()}
                            onFocus={() => setSearchParam(null)}
                            clearTextOnFocus={true}
                        />
                        
                        <TouchableOpacity onPress={() => router.push('/sessionInfoCard')} style={styles.infoButton} >
                            <SimpleLineIcons name="people" size={30} color={theme === 'light' ? 'black' : 'white'} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={{paddingBottom: insets.bottom}} scrollsToTop={true} showsVerticalScrollIndicator={true} style={styles.searchList}>

                        {songList && songList.map(item => (
                                <TouchableOpacity activeOpacity={1} style={styles.searchSongInfo} key={item.uri} >
                                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                        <Image style={styles.smallAlbumCover} source={{uri: item.image}} />

                                        <View style={styles.songInfo}>
                                            <Text style={{fontWeight: 'bold', color: theme === 'light' ? 'black' : 'white'}} >{sliceData(item.name, 30, false)}</Text>
                                            <Text style={{fontWeight: '500', color: theme === 'light' ? 'black' : 'white'}} >{sliceData(item.artist, 2, true)}</Text>
                                        </View>

                                    </View>
                                    

                                    <TouchableOpacity onPress={async () => {console.log("Add to vote list")} }>
                                        <MaterialIcons name="queue" size={35} color={theme === 'light' ? 'black' : 'white'} />
                                    </TouchableOpacity>
                                </TouchableOpacity>                                
                        ))}

                    </ScrollView>

                </View>
            </TouchableWithoutFeedback>
        );
    } else {
        return (

            <View style={styles.container}>

                <StatusBar />
    
                <View style={styles.header} >
                    <TouchableOpacity style={styles.exitButton} onPress={async () => await askLeave()} >
                        <SimpleLineIcons name="logout" size={25} color={ theme === 'light' ? 'black' : 'white'} />
                    </TouchableOpacity>

                    <TextInput
                        style={styles.searchBar}
                        placeholder='Search...'
                        placeholderTextColor={theme === 'light' ? 'black' : 'white'}
                        value={searchParam}
                        onChangeText={setSearchParam}
                        keyboardAppearance={theme}
                        returnKeyType='search'
                        onSubmitEditing={() => searchSong()}
                        onFocus={() => setSearching(true)}
                        clearTextOnFocus={true}
                    />
                    
                    <TouchableOpacity onPress={() => router.push('/sessionInfoCard')} style={styles.infoButton} >
                        <SimpleLineIcons name="people" size={30} color={theme === 'light' ? 'black' : 'white'} />
                    </TouchableOpacity>
                </View>    

                <View style={styles.main}>
    
                        <View style={styles.playback} >
                            <TouchableWithoutFeedback onPress={() => {
                                if (currentSong.image) {
                                    Linking.openURL(currentSong.songURL);
                                } else {
                                    Linking.openURL('spotify://');
                                }
                            }}> 
                                <View style={styles.albumCoverShadow} >
                                    <Image  style={styles.albumCover} source={currentSong.image ? {uri :currentSong.image} : require("../images/spotify-icon.png")} />
                                </View>
                            </TouchableWithoutFeedback>
                            
    
                            <View style={styles.playbackInfo}>
                                <TouchableOpacity onPress={() => {
                                    if (currentSong.uri) {
                                        Linking.openURL(currentSong.songURL);
                                    } else {
                                        Linking.openURL('spotify://');
                                    }
                                }}>
                                    <Text style={{fontWeight: 'bold', color: theme === 'light' ? 'black' : 'white' }} >{currentSong.name ? sliceData(currentSong.name, 35, false) : 'Spotify Not Playing'}</Text>
                                </TouchableOpacity>
    
                                <TouchableOpacity onPress={() => {
                                    if (currentSong.artistsURI[0]) {
                                        Linking.openURL(currentSong.artistsURI[0]);
                                    } else {
                                        Linking.openURL('spotify://');
                                    }
                                }}>
                                    <Text style={{color: theme === 'light' ? 'black' : 'white' }} >{currentSong.artists.join(', ') ? sliceData(currentSong.artists, 2, true) : 'Please start playing on Spotify'}</Text>
                                </TouchableOpacity>
                            </View>
    
                            <Slider
                                containerStyle={styles.slider}
                                minimumValue={0}
                                maximumValue={currentSong.duration}
                                value={currentSong.timestamp}
                                trackClickable={false}
                                minimumTrackTintColor={theme === 'light' ? '#000000' : '#FFFFFF'}
                                maximumTrackTintColor={theme === 'light' ? '#A1A1A1' : "#5E5E5E"}
                                thumbTintColor={theme === 'light' ? 'black' : "white"}
                                thumbStyle={styles.thumb}
                                disabled={true}
                            />
                                                  
                            <View style={styles.sliderInfo}>
                                <TimeDisplay style={{ color: theme === 'light' ? 'black' : 'white', alignSelf: 'flex-start'}} milliseconds={currentSong.timestamp} />
                                <TimeDisplay style={{ color: theme === 'light' ? 'black' : 'white', alignSelf: 'flex-end'}} milliseconds={currentSong.duration} />
                            </View>
                            
                            
                            <View style={styles.playbackControls}>
                                {/* <TouchableOpacity style={{marginRight: 'auto'}} onPress={async () => await handlePrev()}>
                                    <MaterialIcons name="skip-previous" size={50} color={ theme === 'light' ? 'black' : 'white' } />
                                </TouchableOpacity>
    
                                {!isPaused ? (
                                    <TouchableOpacity style={{paddingHorizontal: '5%'}} onPress={async () => await handlePause()}>
                                        <MaterialIcons name="pause" size={50} color={ theme === 'light' ? 'black' : 'white' } />
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity style={{paddingHorizontal: '5%'}} onPress={async () => await handleResume()}>
                                        <MaterialIcons name="play-arrow" size={50} color={ theme === 'light' ? 'black' : 'white' } />
                                    </TouchableOpacity>
                                )}
    
                                <TouchableOpacity style={{marginLeft: 'auto'}} onPress={async () => await handleNext()}>
                                    <MaterialIcons name="skip-next" size={50} color={ theme === 'light' ? 'black' : 'white' } />
                                </TouchableOpacity> */}
                            </View>
                        </View>
                    </View>
    
    
    
                <TouchableOpacity onS onPress={ async () => router.push('/queueModal') } style={styles.queueCard} >
                    <Text style={{color: theme === 'light' ? 'black' : 'white', fontSize: 20 }} >Queue</Text>
                </TouchableOpacity>

            </View>

        );
    }

    // return (

    //     <View style={styles.container}>

    //     </View>


        // <LinearGradient
        //     colors={theme === 'light' ? ['#FFFFFF', '#FFFFFF'] : ['rgb(25, 20, 20)', 'rgb(25, 20, 20)']}
        //     start={{ x: 0, y: 0 }}
        //     end={{ x: 0, y: 1 }}
        //     style={styles.container}
        // >
        //     <SafeAreaView style={styles.container}>
        //         <StatusBar />

        //         { connected ? (
        //             <TouchableWithoutFeedback style={styles.container} onPress={() => {
        //                 if (isSearching) {
        //                     Keyboard.dismiss()
        //                 }
        //             }}>
        //                 <>
        //                     {!showInfo ? (
        //                         <View style={styles.container}>
        //                             {theServerCode && (
        //                                 <>
        //                                     <View style={styles.search}>
        //                                         <View style={styles.searchInput}>
        //                                             {isSearching && (
        //                                                 <TouchableOpacity style={{ paddingLeft: insets.left, paddingRight: 10, width: '20%', justifyContent: 'center', alignItems: 'center' }} onPress={() => {
        //                                                     setSearching(false);
        //                                                     setSearchParam(null);
        //                                                     setSongList(null);
        //                                                     Keyboard.dismiss();
        //                                                 }}>
        //                                                     <Ionicons name="arrow-back" size={40} color="#7D00D1" />
        //                                                 </TouchableOpacity>
        //                                             )}
    
        //                                             {!isSearching && (
        //                                                 <TouchableOpacity style={{ paddingLeft: insets.left, paddingRight: 10, width: '20%', justifyContent: 'center', alignItems: 'center' }} onPress={async () => await leaveServer()}>
        //                                                     <MaterialIcons name="exit-to-app" size={40} color="#7D00D1" />
        //                                                 </TouchableOpacity>
        //                                             )}
    
        //                                             {!votingPhase && (
        //                                                 <TextInput
        //                                                     style={styles.input}
        //                                                     placeholder="Search for a song"
        //                                                     placeholderTextColor={theme === 'light' ? 'black' : 'white'}
        //                                                     value={searchParam}
        //                                                     onChangeText={setSearchParam}
        //                                                     keyboardAppearance={theme}
        //                                                     returnKeyType='search'
        //                                                     onSubmitEditing={() => searchSong()}
        //                                                     onFocus={() => setSearching(true)}
        //                                                 />
        //                                             )}
                                                    
    
                                                    
        //                                         </View>
    
        //                                         {!isSearching ? (
        //                                                 <TouchableOpacity style={{ paddingLeft: 10, paddingRight: 10, position: 'absolute', justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-end' }} onPress={async () => setShowInfo(true)}>
        //                                                     <Ionicons name="people" size={40} color="#7D00D1" />
        //                                                 </TouchableOpacity>
        //                                             ) : (
        //                                                 <TouchableOpacity style={{ paddingLeft: 10, paddingRight: 10, position: 'absolute', alignItems: 'flex-end', alignSelf: 'flex-end' }} onPress={async () => setShowInfo(true)}>
        //                                                     <Ionicons name="people" size={40} color="#7D00D1" />
        //                                                 </TouchableOpacity>
        //                                         )}
    
        //                                         <View style={styles.searchOutput}>
        //                                             {isSearching && (
        //                                                 <ScrollView showsVerticalScrollIndicator={false} style={styles.searchOutput}>
        //                                                     {songList && songList.map(item => (
        //                                                         <TouchableOpacity key={item.uri} style={{ width: '100%', flexDirection: 'row', padding: 10, borderRadius: 10, backgroundColor: item.uri === songSelected.uri ? '#7D00D1' : (theme === 'light' ? '#FFFFFF' : '#191414')}} onPress={() => {
        //                                                             if (item.uri === songSelected.uri) {
        //                                                                 setSongSelected({ name: '', uri: '', artists: '' });
        //                                                             } else {
        //                                                                 setSongSelected(item); 
        //                                                             }
        //                                                         }}>
        //                                                             {/* <TouchableOpacity style={{flexDirection: 'row',}} > */}
        //                                                                 <View>
        //                                                                     <Image style={{width: 55, height: 55}} source={{ uri: item.image }} />
        //                                                                 </View>
        //                                                                 <View style={styles.searchSongInfo}>
        //                                                                     <Text style={{ fontSize: 18, color: (theme === 'light' && item.uri !== songSelected.uri) ? 'black' : 'white', alignItems: 'flex-start' }}>{
        //                                                                     item.name.length <= 25
        //                                                                     ? item.name
        //                                                                     : item.name.slice(0, 25) + '...'
        //                                                                     }</Text>
        //                                                                     <Text style={{ fontSize: 15, color: (theme === 'light' && item.uri !== songSelected.uri) ? 'black' : 'white', alignItems: 'flex-start' }}>{
        //                                                                         item.artist.length <= 2
        //                                                                         ? item.artist.join(', ')
        //                                                                         : item.artist.slice(0, 2).join(', ') + ', ...'
        //                                                                     }</Text>
        //                                                                 </View>
    
        //                                                         </TouchableOpacity>
        //                                                     ))}
        //                                                 </ScrollView>
        //                                             )}
        //                                         </View>
        //                                     </View>
        //                                     <View>
        //                                         {!votingPhase && !isSearching && (
        //                                             <Text style={{alignSelf: 'center', fontWeight: 'bold', color: theme === 'light' ? 'black' : 'white', fontSize: 15, marginBottom: 5}}><Text style={{color: "#7D00D1", fontSize: 20}}>Your Song: </Text>{
        //                                                 songSelected.name ? songSelected.name.length <= 15 ? songSelected.name : songSelected.name.slice(0, 15) + '...' : 'N/A'
        //                                                 }</Text>
        //                                         )}
        //                                     </View>
                                            
        //                                         {!isSearching && !votingPhase && (
        //                                             <View style={styles.serverInfo}>
        //                                                     <Text style={{fontWeight: 'bold', color: theme === 'light' ? 'black' : 'white', fontSize: 17, marginBottom: 0}}>{countdown} Seconds</Text>
        //                                             </View>
        //                                         )}
        //                                         {!isSearching && votingPhase && (
        //                                             <>
        //                                             <View style={{marginTop: 5, position: 'absolute', justifyContent: 'center', alignSelf: 'center'}}>
        //                                                     <Text style={{alignSelf: 'center', fontWeight: 'bold', color: '#7D00D1', fontSize: 20, marginBottom: 5}}>Vote for a song!</Text>
        //                                                     <Text style={{alignSelf: 'center', fontWeight: 'bold', color: theme === 'light' ? 'black' : 'white', fontSize: 17, marginBottom: 0}}>{countdown} Seconds</Text>
        //                                                     <Text style={{alignSelf: 'center', fontWeight: 'bold', color: theme === 'light' ? 'black' : 'white', fontSize: 20, marginBottom: 5, marginTop: 20}}><Text style={{color: "#7D00D1", fontSize: 20}}>Your Song: </Text>{
        //                                                     songSelected.name ? songSelected.name.length <= 15 ? songSelected.name : songSelected.name.slice(0, 15) + '...' : 'N/A'
        //                                                     }</Text>
        //                                             </View>
    
        //                                             <View style={{marginTop: 100, justifyContent: 'center', alignSelf: 'center', width: '100%', paddingHorizontal: 5}}>
        //                                                 {votingList && votingList.map((item, index) => (
        //                                                     <>
        //                                                         {item.uri !== songSelected.uri && (
        //                                                             <TouchableOpacity style={{flexDirection: 'row', width: '100%', paddingHorizontal: 5}}>
        //                                                                 <TouchableOpacity key={index} style={{flexDirection: 'row', width: '90%'}} onPress={() => {
        //                                                                     if (item.uri === songVoted.uri) {
        //                                                                         setSongVoted({ name: '', uri: '', artists: '' });
        //                                                                     } else {
        //                                                                         setSongVoted(item); 
        //                                                                     }
        //                                                                 }}>
        //                                                                     <View>
        //                                                                         <Image style={{width: 55, height: 55}} source={{ uri: item.image }} />
        //                                                                     </View>
        //                                                                     <View style={styles.searchSongInfo}>
        //                                                                         <Text style={{ fontSize: 18, color: (theme === 'light' && item.uri !== songVoted.uri) ? 'black' : 'white', alignItems: 'flex-start' }}>{
        //                                                                         item.name.length <= 25
        //                                                                         ? item.name
        //                                                                         : item.name.slice(0, 25) + '...'
        //                                                                         }</Text>
        //                                                                         <Text style={{ fontSize: 15, color: (theme === 'light' && item.uri !== songVoted.uri) ? 'black' : 'white', alignItems: 'flex-start' }}>{
        //                                                                             item.artist.length <= 2
        //                                                                             ? item.artist.join(', ')
        //                                                                             : item.artist.slice(0, 2).join(', ') + ', ...'
        //                                                                         }</Text>
        //                                                                     </View>
        //                                                                 </TouchableOpacity>
        //                                                             </TouchableOpacity>
        //                                                         )}
        //                                                     </>
        //                                                 ))}
        //                                             </View>
        //                                             </>
        //                                         )}
    
    
        //                                     <View style={styles.song}>
        //                                         {!isSearching && !votingPhase && (
        //                                             <>
        //                                                 {currentSong.uri !== '' ? (
        //                                                     <>
        //                                                         <TouchableWithoutFeedback onPress={() => Linking.openURL(currentSong.uri)}>
        //                                                             <Image source={{ uri: currentSong.image }} style={styles.image}></Image>
        //                                                         </TouchableWithoutFeedback>
    
        //                                                         <View style={styles.songInfo}>
        //                                                             <TouchableWithoutFeedback onPress={() => Linking.openURL(currentSong.uri)}>
        //                                                                 <Text style={styles.songName}>{
        //                                                                 currentSong.name.length <= 40
        //                                                                 ? currentSong.name
        //                                                                 : currentSong.name.slice(0, 40) + '...'
        //                                                                 }</Text>
        //                                                             </TouchableWithoutFeedback>
    
        //                                                             <TouchableWithoutFeedback onPress={() => Linking.openURL(currentSong.artistsURI[0])}>
        //                                                                 <Text style={styles.artist}>{
        //                                                                 currentSong.artists.length <= 3
        //                                                                 ? currentSong.artists.join(", ")
        //                                                                 : currentSong.artists.slice(0, 3).join(', ') + ', ...'}</Text>
        //                                                             </TouchableWithoutFeedback>
                                                                    
        //                                                             <View style={{ alignItems: 'center', flexDirection: 'row', transform: [{scaleX: 0.4}, {scaleY: 0.4}]}}>
        //                                                                 <TimeDisplay style={{color: theme === 'light' ? 'black' : 'white', fontSize: 30, fontWeight: '500', paddingHorizontal: 10}} milliseconds={currentSong.timestamp}/>
        //                                                                 <Slider
        //                                                                     style={{ margin: 0, padding: 0, width: 725, height: 50}}
        //                                                                     minimumValue={0}
        //                                                                     maximumValue={currentSong.duration}
        //                                                                     value={currentSong.timestamp}
        //                                                                     minimumTrackTintColor={theme === 'light' ? '#000000' : '#FFFFFF'}
        //                                                                     maximumTrackTintColor={theme === 'light' ? '#A1A1A1' : "#5E5E5E"}
        //                                                                     thumbTintColor={theme === 'light' ? 'black' : "white"}
        //                                                                     step={1}
        //                                                                     disabled={true}
                                                                            
        //                                                                 />
        //                                                                 <TimeDisplay style={{color: theme === 'light' ? 'black' : 'white', fontSize: 30, fontWeight: '500', paddingHorizontal: 10}} milliseconds={currentSong.duration}/>
        //                                                             </View>
        //                                                         </View>
        //                                                     </>
        //                                                 ) : (
    
        //                                                     <>
        //                                                         <TouchableWithoutFeedback onPress={() => Linking.openURL("spotify://")}>
        //                                                             <Image source={require('../images/spotify-icon.png')} style={styles.image} />
        //                                                         </TouchableWithoutFeedback>
    
        //                                                         <View style={styles.songInfo}>
        //                                                             <Text style={styles.songName}>Spotify not Playing</Text>
        //                                                             <Text style={styles.artist}>Please Tell Host to Play Spotify</Text>
        //                                                         </View>
        //                                                     </>
    
        //                                                 )}
    
        //                                             </>
        //                                         )}
        //                                     </View>
        //                                 </>
        //                             )}
        //                         </View>
        //                     ) : (
        //                         <View style={styles.container}>
    
        //                             <TouchableOpacity
        //                                 style={{ position: 'absolute', paddingLeft: 10, paddingRight: 10, left: 0, justifyContent: 'center', alignItems: 'center' }}
        //                                 onPress={() => setShowInfo(false)}>
        //                                 <Ionicons name="arrow-back" size={40} color="#7D00D1" />
        //                             </TouchableOpacity>
    
        //                             <Text style={styles.infoHeader}>Server Info</Text>
    
        //                             <View style={styles.serverInfo}>
        //                                 <Text style={styles.serverCode}><Text style={{color: "#7D00D1", fontSize: 28}}>Code: </Text>{theServerCode}</Text>
    
        //                                 <Text style={styles.hostLabel}>Host:</Text>
    
        //                                 {listUsers.host && (
        //                                     <Text style={styles.users}>{listUsers.host.username}</Text>
        //                                 )}
    
        //                                 <Text style={styles.membersLabel}>Members: </Text>
        //                                 {listUsers.users && listUsers.users.map((user, index) => (
        //                                     <Text style={styles.users} key={index}>{user.username}</Text>
        //                                 ))}
        //                             </View>
        //                         </View>
        //                     )}
                        
        //                 </>
        //             </TouchableWithoutFeedback>
        //         ) : (
        //             <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        //                 <ActivityIndicator
        //                     animating={true}
        //                     size='large'
        //                     color="#7D00D1" // Set the color of the spinner
        //                 />
        //             </View>
        //         )}

                
        //     </SafeAreaView>
        // </LinearGradient>
        
    // );
    ////////////////////////////////////////////////////////////////////////////////////////////////
}