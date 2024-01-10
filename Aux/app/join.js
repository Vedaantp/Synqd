import * as React from 'react';
import { StyleSheet, StatusBar, Text, View, useColorScheme, TouchableOpacity, Alert, TextInput, ScrollView, Image, TouchableWithoutFeedback, Keyboard, Dimensions, Linking } from "react-native";
import { Slider } from "@miblanchard/react-native-slider";
import { MaterialIcons } from '@expo/vector-icons';
import { SimpleLineIcons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
    const [searchParam, setSearchParam] = React.useState(null);
    const [songList, setSongList] = React.useState(null);
    const [currentSong, setCurrentSong] = React.useState({name: '', uri: '', image: '', artists: [], artistsURI: [], timestamp: 0});
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

        newSocket.on("userTimedOut", ({ userId }) => {
            checkTimeOut(userId);
        });

        newSocket.on('kickedUser', ({userId}) => {
            checkUserLeft(userId);
        });

        newSocket.on('userLeft', ({userId}) => {
            checkUserLeft(userId);
        });

        newSocket.on("heartbeatReceived", (data) => {
            console.log("Heartbeat received: ", data);
        });

        newSocket.on('currentSongInfo', ({songInfo}) => {
            setCurrentSong(songInfo);
        });

        newSocket.on("cannotVoteSelf", ({userId}) => {
            checkVoteSelf(userId);
        });

        setSocket(newSocket);

        return () => {
            clearInterval(heartbeatInterval);
            newSocket.disconnect();
        };
    }, [])

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

            socket.emit('updateUser', { username: username, userId: userId, serverCode: serverCode });
        } else {
    
            socket.emit('joinServer', { serverCode: serverCode, username: username, userId: userId });
        }
    };

    const rejoin = async (socket) => {
        const username = await getValue("username");
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");
        await AsyncStorage.setItem("hosting", "false");

        socket.emit('joinServer', { serverCode: serverCode, username: username, userId: userId });
    };

    const checkUserJoined = async (userId, newSocket) => {
        const myUserId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        if (userId === myUserId) {

            if (heartbeatInterval === null) {
                heartbeatInterval = setInterval(() => {sendHeartbeat(newSocket, serverCode)}, 60000);
            }
        }
    };

    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");

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

    const checkUserLeft = async (userId) => {
        const myUserId = await getValue("userId");

        if (userId === myUserId) {
            await AsyncStorage.removeItem("serverCode");
            await AsyncStorage.setItem("hosting", "false");
            await AsyncStorage.setItem("rejoining", "false");

            router.replace('/');
        }
    };

    const hostLeft = async () => {
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
        router.replace('/');
    };

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

        router.replace('/');
    };

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
                        body: {
                            grant_type: "refresh_token",
                        },
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

    const handleAddVote = async (item) => {
        const serverCode = await getValue("serverCode");
        const userId = await getValue("userId");

        if (socket) {
            socket.emit("votingSong", {serverCode: serverCode, songInfo: item, userId: userId });
        }
    };

    const checkVoteSelf = async (userId) => {
        const myId = await getValue("userId");

        if (myId === userId) {
            console.log("Cannot vote self");
        }
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // styles

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
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: insets.bottom,
            paddingTop: '25%'
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
            marginTop: '5%'
        },
        slider: { 
            width: '80%',
            marginTop: '1%'
        },
        sliderInfo: {
            marginTop: '-3%',
            width: '80%',
            flexDirection: "row",
            justifyContent: 'space-between'
        },
        bottomGroup: {
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            width: '50%',
            paddingBottom: '35%'

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
                                    

                                    <TouchableOpacity onPress={async () => handleAddVote(item) }>
                                        <MaterialIcons name="playlist-add" size={35} color={theme === 'light' ? 'black' : 'white'} />
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
                        </View>

                        <View style={styles.bottomGroup}>
                            <TouchableOpacity onPress={() => router.push('/voteModal')} style={{marginRight: 'auto'}}>
                                <MaterialCommunityIcons name="list-status" size={40} color={ theme === 'light' ? 'black' : 'white'} />
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => router.push('/queueModal')}>
                                <MaterialIcons name="playlist-play" size={50} color={ theme === 'light' ? 'black' : 'white' } />
                            </TouchableOpacity>
                            
                        </View>
                    </View>

            </View>

        );
    }

}