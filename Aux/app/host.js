import * as React from 'react';
import { StyleSheet, StatusBar, Text, View, useColorScheme, TouchableOpacity, Alert, TextInput, ScrollView, Image, TouchableWithoutFeedback, Keyboard, Dimensions, Linking } from "react-native";
import { Slider } from "@miblanchard/react-native-slider";
import { MaterialIcons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SimpleLineIcons } from '@expo/vector-icons';
import { refreshAsync } from 'expo-auth-session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { router } from 'expo-router';

function TimeDisplay({ style, milliseconds, }) {
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
    // Variables

    const [serverCode, setTheServerCode] = React.useState(null);
    const [socket, setSocket] = React.useState(null);
    const [songList, setSongList] = React.useState(null);
    const [searchParam, setSearchParam] = React.useState(null);
    const [currentSong, setCurrentSong] = React.useState({ name: '', uri: '', image: '', artists: [], artistsURI: [], timestamp: 0 });
    const [isPaused, setPaused] = React.useState(false);
    const [isSearching, setSearching] = React.useState(false);
    const [queueAlert, setQueueAlert] = React.useState(false);
    const searchBarRef = React.useRef(null);
    const [validToken, setValidToken] = React.useState(true);
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    const tokenEndpoint = 'https://accounts.spotify.com/api/token';
    const clientId = '43d48850732744018aff88a5692d03d5';
    const insets = useSafeAreaInsets();
	const theme = useColorScheme();
    const { height: deviceHeight, width: deviceWidth } = Dimensions.get('window');
    let heartbeatInterval = null;
    let getCurrent = null;
    let oldSong = null;
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // On mount functions

    React.useEffect(() => {

        const setServerCode = async (serverCode) => {
            await AsyncStorage.setItem("serverCode", serverCode);
            setTheServerCode(serverCode);
        };

        const newSocket = io(serverUrl);

        newSocket.on('connect', () => {
            console.log('Connected to server');
            hostServer(newSocket);
        });

        newSocket.on('serverCreated', ({ serverCode }) => {
            console.log('Server created with code: ', serverCode);
            setServerCode(serverCode);

            if (heartbeatInterval === null) {
                heartbeatInterval = setInterval( async () => { await sendHeartbeat(newSocket, serverCode) }, 60000);
            }

            if (getCurrent === null) {
                getCurrent = setInterval( async () => { await getCurrentPlaying() }, 1000);
            }
        });

        newSocket.on("hostRejoined", () => {
            console.log("Host rejoined");

            if (heartbeatInterval === null) {
                heartbeatInterval = setInterval( async () => { await sendHeartbeat(newSocket, serverCode) }, 60000);
            }

            if (getCurrent === null) {
                getCurrent = setInterval( async () => { await getCurrentPlaying() }, 1000);
            }
        });

        newSocket.on('hostLeft', (data) => {
            console.log("Host left: ", data);
            clearInterval(heartbeatInterval);
            clearInterval(getCurrent);
            router.replace('/');
        });

        newSocket.on('hostTimedOut', (data) => {
            console.log("Host timed out: ", data);
            timedOut();

            clearInterval(heartbeatInterval);
            clearInterval(getCurrent);
            router.replace('/');
        });

        newSocket.on("leaveError", (data) => {
            console.log("Leave error: ", data);
        });

        newSocket.on("joinError", (data) => {
            console.log("Join error: ", data);
            joinError();
        });

        newSocket.on("heartbeatReceived", (data) => {
            console.log("Heartbeat received: ", data);
        });

        newSocket.on("songVoted", ({songInfo}) => {
            console.log("Song voted", songInfo);

            const handleRoutine = async (uri) => {
                await handleAddQueue(uri);
                await getQueue();
            };

            if (songInfo) {
                handleRoutine(uri);
            }
        });

        newSocket.on("cannotVoteSelf", ({userId}) => {
            checkVoteSelf(userId);
        });

        setSocket(newSocket);

        return () => {
            clearInterval(heartbeatInterval);
            clearInterval(getCurrent);
            newSocket.disconnect();

        };
    }, []);

    React.useEffect(() => {
        sendSongInfo()

        if (currentSong.uri === oldSong) {
            getQueue();
            oldSong = currentSong.uri;
        }

    }, [currentSong])

    React.useEffect(() => {
        getQueue();
    }, [currentSong.uri]);

    React.useEffect(() => {
        if (isSearching) {
            searchBarRef.current.focus();
        }
    }, [isSearching])

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // extra functions

    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };

    const sendSongInfo = async () => {
        const serverCode = await getValue("serverCode");
        const userId = await getValue("userId");

        if (socket) {
            socket.emit("songInfo", { serverCode: serverCode, userId: userId, songInfo: currentSong });
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
    // server join and leave functions

    const hostServer = async (socket) => {
        const username = await getValue("username");
        const userId = await getValue("userId");
        const rejoin = await getValue("rejoining");
        const serverCode = await getValue("serverCode");
        await AsyncStorage.setItem("hosting", "true");

        if (serverCode || rejoin === 'true') {
            socket.emit("updateHost", { username: username, userId: userId, serverCode: serverCode });
        } else {
            socket.emit('createServer', { username: username, userId: userId });
        }

    };

    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");
        
        if (socket) {
            socket.emit('leaveServer', { serverCode: serverCode, userId: userId });
        }

        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
    };

    const joinError = async () => {
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("rejoining", 'false');

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

    const askLeave = async () => {
        Alert.alert(
            "End Session?",
            "",
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

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // api functions

    const validateAuth = async () => {
        const accessToken = await getValue("accessToken");
        const expiration = await getValue("expiration");
        let expirationTime = parseInt(expiration, 10);
        let currentTime = Date.now();

        if (accessToken) {
            if (currentTime >= expirationTime) {
                return await refreshAccessToken();
            } else {
                setValidToken(true);
                return true;
            }
        } else {
            if (validToken) {
                console.log("Access token was invalid");
                setValidToken(false);
                clearInterval(getCurrent);

                const userId = await getValue("userId");
                const serverCode = await getValue("serverCode");

                if (socket) {
                    socket.emit('leaveServer', { serverCode: serverCode, userId: userId });
                }

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

                return false;
            }
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
                        }
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

            setValidToken(true);
            return true;

        } catch (error) {

            console.error("Refresh error: ", error);
            const userId = await getValue("userId");
            const serverCode = await getValue("serverCode");

            if (socket) {
                socket.emit('leaveServer', { serverCode: serverCode, userId: userId });
            }

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

            setValidToken(false);
            return false;
        }

    };

    const getQueue = async () => {
        console.log("Getting the queue");

        await validateAuth();

        const accessToken = await getValue('accessToken');
        const serverCode = await getValue("serverCode");
        const endpoint = "https://api.spotify.com/v1/me/player/queue";

        const spotifyParams = {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        };

        await fetch(endpoint, spotifyParams)
            .then((response) => response.json())
            .then((data) => {

                const songs = data.queue.map(item => ({
                    image: item.album.images[0].url,
                    name: item.name,
                    artists: (item.artists.map(artistItem => artistItem.name)),
                    songURL: item.album.external_urls.spotify,
                    artistURL: item.artists.map(artist => artist.external_urls.spotify),
                }));

                if (socket) {
                    socket.emit("hostQueueList", {songs: songs, serverCode: serverCode});
                }

            })
            .catch((error) => {
                console.error("Get queue error: ", error);
            });


    };

    const searchSong = async () => {

        if (searchParam) {

            await validateAuth();

            const accessToken = await getValue("accessToken");
            const endpoint = `https://api.spotify.com/v1/search?q=${searchParam}&type=track&market=US&limit=50`;

            const spotifyParams = {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            };

            await fetch(endpoint, spotifyParams)
                .then((response) => response.json())
                .then((data) => {
                    const songs = data.tracks.items.map(item => ({
                        name: item.name,
                        uri: item.uri,
                        isPlayable: item.is_playable,
                        artist: (item.artists.map(artistItems => artistItems.name)),
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

    const getCurrentPlaying = async () => {

        if (validToken) {

            if (await validateAuth()) {


                const accessToken = await getValue("accessToken");
                const endpoint = 'https://api.spotify.com/v1/me/player';

                const spotifyParams = {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    }
                };

                const response = await fetch(endpoint, spotifyParams);
                
                try {
                    if (response.status === 200) {
                        const data = await response.json();

                        const song = {
                            name: data.item.name,
                            image: data.item.album.images[0].url,
                            artists: (data.item.artists.map(artist => artist.name)),
                            songURL: data.item.album.external_urls.spotify,
                            artistsURI: (data.item.artists.map(artist => artist.uri)),
                            uri: data.item.uri,
                            albumURI: data.item.album.uri,
                            timestamp: data.progress_ms,
                            duration: data.item.duration_ms
                        };

                        setPaused(!data.is_playing);
                        setCurrentSong(song);

                    } else {

                        const serverCode = await getValue("accessCode");
                        const userId = await getValue("userId");

                        console.error("Get current playback error: ", response.status);
                        setCurrentSong({ name: '', image: '', artists: [], artistsURI: [], uri: '', timestamp: 0, duration: 0 });

                        if (socket) {
                            socket.emit("songInfo", { serverCode: serverCode, userId: userId, songInfo: { name: '', image: '', artists: [], artistsURI: [], uri: '', timestamp: 0, duration: 0 } });
                        }
                    }
                } catch (error) {
                    console.log("Get current playback error: ", error);
                    setCurrentSong({ name: '', image: '', artists: [], artistsURI: [], uri: '', timestamp: 0, duration: 0 });
                }
            }
        }
    };

    const handlePlaySong = async (uri) => {

        await validateAuth();

        const accessToken = await getValue("accessToken");
        const endpoint = 'https://api.spotify.com/v1/me/player/play';
        const spotifyParams = {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ uris: [uri] }),
        };

        await fetch(endpoint, spotifyParams)
            .then((response) => {
                if (response.ok) {
                    console.log("Successfully played song");
                } else {
                    console.log("Failed to play song", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Play song error: ", error);
            })
    };

    const handleResume = async () => {

        await validateAuth();

        const accessToken = await getValue("accessToken");
        const endpoint = 'https://api.spotify.com/v1/me/player/play';
        const spotifyParams = {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        };

        await fetch(endpoint, spotifyParams)
            .then((response) => {
                if (response.ok) {
                    console.log("Successfully resumed playback");
                    setPaused(false);
                } else {
                    console.log("Failed to resume playback", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Resume error: ", error);
            })
    };

    const handlePause = async () => {

        await validateAuth();

        const accessToken = await getValue("accessToken");
        const endpoint = 'https://api.spotify.com/v1/me/player/pause';

        const spotifyParams = {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        };

        await fetch(endpoint, spotifyParams)
            .then((response) => {
                if (response.ok) {
                    console.log("Successfully paused playback");
                    setPaused(true);
                } else {
                    console.log("Failed to pause playback", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Pause error: ", error);
            })
    };

    const handleNext = async () => {

        await validateAuth();

        const accessToken = await getValue("accessToken");
        const endpoint = 'https://api.spotify.com/v1/me/player/next';

        const spotifyParams = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        };

        await fetch(endpoint, spotifyParams)
            .then((response) => {
                if (response.ok) {
                    console.log("Successfully skipped song");
                    getCurrentPlaying();
                } else {
                    console.log("Failed to skip song", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Skip error: ", error);
            })
    };

    const handlePrev = async () => {

        await validateAuth();

        const accessToken = await getValue("accessToken");
        const endpoint = 'https://api.spotify.com/v1/me/player/previous';

        const spotifyParams = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        };

        await fetch(endpoint, spotifyParams)
            .then((response) => {
                if (response.ok) {
                    console.log("Successfully went to previous song");
                    getCurrentPlaying();
                } else {
                    console.log("Failed to go to previous song", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Previous error: ", error);
            })
    };

    const handleAddQueue = async (songURI) => {

        await validateAuth();

        const accessToken = await getValue("accessToken");
        const endpoint = `https://api.spotify.com/v1/me/player/queue?uri=${songURI}`;

        const spotifyParams = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        };

        await fetch(endpoint, spotifyParams)
            .then((response) => {
                if (response.ok) {
                    console.log("Successfully added song to queue");
                    setQueueAlert(true);
                    setTimeout(() => setQueueAlert(false), 750);
                    getCurrentPlaying();
                } else {
                    console.log("Failed to add song to queue", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Queue error: ", error);
            })

    };

    const handleSeek = async (milliseconds) => {

        await validateAuth();

        const accessToken = await getValue("accessToken");
        const endpoint = `https://api.spotify.com/v1/me/player/seek?position_ms=${milliseconds}`;

        const spotifyParams = {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        };

        await fetch(endpoint, spotifyParams)
            .then((response) => {
                if (response.ok) {
                    console.log("Successfully seeked to position");
                    getCurrentPlaying();
                } else {
                    console.log("Failed to seek to position", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Seek error: ", error);
            })

    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // time out functions

    const timedOut = async () => {
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
    };

    const sendHeartbeat = async (socket) => {
        const serverCode = await getValue("serverCode");
        const userId = await getValue("userId");
        console.log("Sending heartbeat");
        socket.emit("heartbeat", { serverCode: serverCode, userId: userId });
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // voting functions

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
        queueAlert: {
            position: 'absolute',
            flexDirection: 'row',
            alignSelf: 'center',
            justifyContent: 'center', 
            alignItems: 'center',
            top: '15%',
            width: '45%',
            height: '10%',
            backgroundColor: theme === 'light' ? '#242424' : '#ebebeb',
            borderRadius: 25,

            ...Platform.select({
                ios: {
                  shadowColor: theme == 'light' ? 'black' : 'white',
                  shadowOpacity: 0.75,
                  shadowRadius: 10,
                  shadowOffset: {
                    width: 0,
                    height: 0,
                  },
                },
                android: {
                  elevation: 5,
                },
            })
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
            width: 0.125 * deviceWidth,
            height: 0.125 * deviceWidth,
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
            paddingTop: '15%'
        },
        playback: {
            flex: 1,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center'
        },
        albumCover: {
            width: 0.8 * deviceWidth,
            height: 0.8 * deviceWidth,
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
        playbackControls: {
            paddingHorizontal: '20%',
            marginTop: '2%', 
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%'
        },
        bottomGroup: {
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            width: '50%',
            paddingBottom: '15%'

        },
        thumb: {
            backgroundColor: theme === 'light' ? 'black' : 'white',
            borderRadius: 10 / 2,
            width: 10,
            height: 10,
        },
    });

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // screen

    if (isSearching) { 
        return (
            <TouchableWithoutFeedback activeOpacity={1} style={styles.container}>
                <View style={styles.container}>
                    <StatusBar />

                    {queueAlert && (
                        <View style={styles.queueAlert}>
                            <MaterialIcons name="playlist-add" size={50} color={theme === 'light' ? 'white' : 'black'} />
                            <Text style={{color: theme === 'light' ? 'white' : 'black'}}>Song Queued!</Text>
                        </View>
                    )}

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
                                    

                                    <TouchableOpacity onPress={async () => await handleAddVote(item) }>
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
                                <TouchableOpacity style={{paddingBottom: '1%'}} onPress={() => {
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
                                // style={styles.slider}
                                containerStyle={styles.slider}
                                minimumValue={0}
                                maximumValue={currentSong.duration}
                                value={currentSong.timestamp}
                                onSlidingComplete={async (value) => await handleSeek(value) }
                                trackClickable={false}
                                minimumTrackTintColor={theme === 'light' ? '#000000' : '#FFFFFF'}
                                maximumTrackTintColor={theme === 'light' ? '#A1A1A1' : "#5E5E5E"}
                                thumbTintColor={theme === 'light' ? 'black' : "white"}
                                thumbStyle={styles.thumb}
                                step={1}
                            />
                                                  
                            <View style={styles.sliderInfo}>
                                <TimeDisplay style={{ color: theme === 'light' ? 'black' : 'white', alignSelf: 'flex-start'}} milliseconds={currentSong.duration ? currentSong.timestamp : currentSong.duration} />
                                <TimeDisplay style={{ color: theme === 'light' ? 'black' : 'white', alignSelf: 'flex-end'}} milliseconds={currentSong.duration} />
                            </View>
                            
                            
                            <View style={styles.playbackControls}>
                                <TouchableOpacity style={{marginRight: 'auto'}} onPress={async () => await handlePrev()}>
                                    <MaterialIcons name="skip-previous" size={55} color={ theme === 'light' ? 'black' : 'white' } />
                                </TouchableOpacity>
    
                                {!isPaused ? (
                                    <TouchableOpacity style={{paddingHorizontal: '5%'}} onPress={async () => await handlePause()}>
                                        <MaterialIcons name="pause" size={65} color={ theme === 'light' ? 'black' : 'white' } />
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity style={{paddingHorizontal: '5%'}} onPress={async () => await handleResume()}>
                                        <MaterialIcons name="play-arrow" size={65} color={ theme === 'light' ? 'black' : 'white' } />
                                    </TouchableOpacity>
                                )}
    
                                <TouchableOpacity style={{marginLeft: 'auto'}} onPress={async () => await handleNext()}>
                                    <MaterialIcons name="skip-next" size={55} color={ theme === 'light' ? 'black' : 'white' } />
                                </TouchableOpacity>
    
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