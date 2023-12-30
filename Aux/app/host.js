import * as React from 'react';
import { StyleSheet, Text, View, StatusBar, TouchableOpacity, Alert, TextInput, ScrollView, Image, TouchableWithoutFeedback, Keyboard, Dimensions, Linking, ActivityIndicator } from "react-native";
import Slider from '@react-native-community/slider';
import LinearGradient from 'react-native-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { AntDesign } from '@expo/vector-icons';
import { refreshAsync } from 'expo-auth-session';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

    const [socket, setSocket] = React.useState(null);
    const [theServerCode, setTheServerCode] = React.useState(null);
    const [listUsers, setListUsers] = React.useState({ users: [], host: {} });
    const [songList, setSongList] = React.useState(null);
    const [searchParam, setSearchParam] = React.useState(null);
    const [songSelected, setSongSelected] = React.useState({ name: '', uri: '', artists: '', isPlayable: '' });
    const [currentSong, setCurrentSong] = React.useState({ name: '', uri: '', image: '', artists: [], artistsURI: [], timestamp: 0 });
    const [isPaused, setPaused] = React.useState(false);
    const [isSearching, setSearching] = React.useState(false);
    const [votingPhase, setVotingPhase] = React.useState(false);
    const [showInfo, setShowInfo] = React.useState(false);
    const [timeStamp, setTimeStamp] = React.useState(0);
    const [seeking, setSeeking] = React.useState(false);
    const [showAlert, setShowAlert] = React.useState(false);
    const [connected, setConnected] = React.useState(false);
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    const tokenEndpoint = 'https://accounts.spotify.com/api/token';
    const clientId = '43d48850732744018aff88a5692d03d5';
    const insets = useSafeAreaInsets();
    const { height: deviceHeight, width: deviceWidth } = Dimensions.get('window');
    let heartbeatInterval = null;
    let getCurrent = null;
    let sendInfo = null;
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // On mount functions

    // once user is directed to this page of the app
    // it will connect user to the server and attempt to host the server
    React.useEffect(() => {

        const setServerCode = async (serverCode) => {
            await AsyncStorage.setItem("serverCode", serverCode);
            const value = await getValue("serverCode");

            if (value !== null) {
                setTheServerCode(value);
            }
        };

        const newSocket = io(serverUrl);

        newSocket.on('connect', () => {
            console.log('Connected to server');
            hostServer(newSocket);
        });

        newSocket.on('serverCreated', ({ serverCode }) => {
            console.log('Server created with code: ', serverCode);
            setServerCode(serverCode);
            startServer(newSocket, serverCode);
            setConnected(true);
            heartbeatInterval = setInterval(() => { sendHeartbeat(newSocket, serverCode) }, 60000);
            getCurrent = setInterval(() => { getCurrentPlaying() }, 500);
        });

        newSocket.on('updateUsers', (data) => {
            console.log('Users updated: ', data);
            setListUsers(data);
        });

        newSocket.on("hostRejoined", () => {
            console.log("Host rejoined");
            setConnected(true);
            heartbeatInterval = setInterval(() => { sendHeartbeat(newSocket) }, 60000);
            getCurrent = setInterval(() => { getCurrentPlaying() }, 500);
        });

        newSocket.on('hostLeft', (data) => {
            console.log("Host left: ", data);
            router.replace('/home');
        });

        newSocket.on('hostTimedOut', (data) => {
            console.log("Host timed out: ", data);
            timedOut();
            router.replace('/home');
        });

        newSocket.on("leaveError", (data) => {
            console.log("Leave error: ", data);
        });

        newSocket.on("joinError", (data) => {
            console.log("Join error: ", data);
            joinError();
        });

        newSocket.on('countdownUpdate', ({ timerIndex, remainingTime }) => {

            if (timerIndex === 0) {
                setVotingPhase(false);
            } else {
                setVotingPhase(true);
            }
        });

        newSocket.on("heartbeatReceived", (data) => {
            console.log("Heartbeat received: ", data);
        });

        newSocket.on("votedSong", ({ uri }) => {
            console.log("Voted song: ", uri);

            if (uri !== '') {
                handleAddQueue(uri);
            }

        });

        setSocket(newSocket);

        return () => {
            clearInterval(heartbeatInterval);
            clearInterval(getCurrent);
            newSocket.disconnect();
        };
    }, []);

    React.useEffect(() => {

        if (!votingPhase) {
            setTimeout(() => getVotedSong(), 500);
        }

    }, [votingPhase]);

    React.useEffect(() => {
        sendSongInfo()
    }, [currentSong])
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // extra functions

    // function to get the values from async storage
    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };

    const showQueue = async () => {

        // Add modal later
        setShowAlert(true);

        // Close the alert after 1 second
        setTimeout(() => {
            setShowAlert(false);
        }, 1000);

        console.log("Song queued!");

    };

    const CustomAlert = ({ message }) => {
        return (
            <View style={styles.alertContainer}>
                <Text style={styles.alertText}>{message}</Text>
            </View>
        );
    };

    const sendSongInfo = async () => {
        const serverCode = await getValue("serverCode");
        const userId = await getValue("userId");

        if (socket) {
            socket.emit("songInfo", { serverCode: serverCode, userId: userId, songInfo: currentSong });
        }

    };    
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // server join and leave functions

    // function is called when user is directed to this page
    // if the user is not rejoining, it will attempt to host a server and create a unique server code
    // if the user is rejoining, it will attempt to rejoing the server using the old server code that was created
    const hostServer = async (socket) => {
        const username = await getValue("username");
        const userId = await getValue("userId");
        const rejoin = await getValue("rejoining");
        const serverCode = await getValue("serverCode");
        await AsyncStorage.setItem("hosting", "true");

        if (serverCode || rejoin === 'true') {
            console.log("Host Reconnected");
            setTheServerCode(serverCode);

            // check if the server still exists
            socket.emit("updateHost", { username: username, userId: userId, serverCode: serverCode });
        } else {
            socket.emit('createServer', { username: username, userId: userId });
        }

    };

    // if the user attempts to leave the server
    // it will clear any data associated with the server and disconnect the host
    // this will end the server
    // will not allow for rejoin
    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        socket.emit('end', { serverCode: serverCode, userId: userId });
        socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

        setConnected(false);

        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
    };

    // once the host creates the server and server code, it will start the countdown timer for the phases
    const startServer = async (socket, serverCode) => {
        const userId = await getValue("userId");

        socket.emit("start", { serverCode: serverCode, userId: userId });
    };

    // if the host was not able to join it will remove any data associated with the server
    // will not allow for rejoin
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
                await refreshAccessToken();
            }
        } else {

            console.log("Access token was invalid");

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
            console.log(refreshToken)

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

            console.error("Refresh error: ", error);
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
            const endpoint = `https://api.spotify.com/v1/search?q=${searchParam}&type=track&market=US`;

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

        // verify accessToken and if not valid refresh it
        await validateAuth();

        const accessToken = await getValue("accessToken");
        const endpoint = 'https://api.spotify.com/v1/me/player';

        const spotifyParams = {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        };

        await fetch(endpoint, spotifyParams)
            .then((response) => response.json())
            .then((data) => {
                const song = {
                    name: data.item.name,
                    image: data.item.album.images[0].url,
                    artists: (data.item.artists.map(artist => artist.name)),
                    artistsURI: (data.item.artists.map(artist => artist.uri)),
                    uri: data.item.uri,
                    albumURI: data.item.album.uri,
                    timestamp: data.progress_ms,
                    duration: data.item.duration_ms
                };

                if (data.is_playing) {
                    setPaused(false);
                } else {
                    setPaused(true);
                }

                setCurrentSong(song);

                // if (socket) {
                //     socket.emit("songInfo", { serverCode: serverCode, userId: userId, songInfo: song});
                // }

                if (!seeking) {
                    setTimeStamp(song.timestamp);
                }
            })
            .catch((error) => {
                console.error("Get current playback error: ", error);
                setCurrentSong({ name: '', image: '', artists: [], artistsURI: [], uri: '', timestamp: 0, duration: 0 });

                if (socket) {
                    socket.emit("songInfo", { serverCode: serverCode, userId: userId, songInfo: { name: '', image: '', artists: [], artistsURI: [], uri: '', timestamp: 0, duration: 0 } });
                }
            })
    };

    const handlePlaySong = async (uri) => {
        // verify accessToken and if not valid refresh it
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

        // verify accessToken and if not valid refresh it
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
                } else {
                    console.log("Failed to resume playback", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Resume error: ", error);
            })
    };

    const handlePause = async () => {

        // verify accessToken and if not valid refresh it
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
                } else {
                    console.log("Failed to pause playback", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Pause error: ", error);
            })
    };

    const handleNext = async () => {

        // verify accessToken and if not valid refresh it
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

        // verify accessToken and if not valid refresh it
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

        // verify accessToken and if not valid refresh it
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
                    getCurrentPlaying();
                } else {
                    console.log("Failed to add song to queue", response.status, response.statusText);
                }
            })
            .catch((error) => {
                console.error("Queue error: ", error);
            })

    };

    handleSeek = async (milliseconds) => {

        // verify accessToken and if not valid refresh it
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


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // time out functions

    // if the host timed out it will remove any associated data with the server
    // will not allow for rejoin
    // will destroy the server
    const timedOut = async () => {
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
        setConnected(false);
    };

    // function that is called once host successfully joined server
    // sends a heart beat to server to avoid timeout
    const sendHeartbeat = async (socket) => {
        const serverCode = await getValue("serverCode");
        const userId = await getValue("userId");
        console.log("Sending heartbeat");
        socket.emit("heartbeat", { serverCode: serverCode, userId: userId });
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // voting functions

    const getVotedSong = async () => {
        const serverCode = await getValue("serverCode");
        const userId = await getValue("userId");

        if (socket) {
            socket.emit("getVotedSong", { serverCode: serverCode, userId: userId });
        }
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
            marginTop: 40,
            flexDirection: 'column',
            alignItems: 'center',
        },
        serverCode: {
            fontWeight: 'bold',
            fontSize: 23,
            color: "white",
            marginBottom: 30
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
            marginBottom: 20
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
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-start'
        },
        infoHeader: {
            color: '#7D00D1',
            position: 'absolute',
            fontSize: 35,
            fontWeight: "bold",
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'center'
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
    });
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // screen

    // displays the server code, the countdown, the phase, the list of users in the server, a leave button, 
    // a search box to find a song, a search button, a label that tells what song user selected, and a list of
    // songs from search
    return (
        <LinearGradient
            colors={['rgb(31, 31, 31)', 'rgb(31, 31, 31)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.container}
        >
            <SafeAreaView style={styles.container}>
                <StatusBar barStyle='light-content' />

                {connected ? (

                    <TouchableWithoutFeedback style={styles.container} onPress={() => {
                        if (isSearching) {
                            Keyboard.dismiss()
                        }
                    }}>
                        <>
                            {showAlert && (
                                <CustomAlert
                                    message="Song queued!"
                                />
                            )}

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

                                                    {!isSearching && (
                                                        <TouchableOpacity style={{ paddingLeft: 10, paddingRight: insets.right, width: '20%', justifyContent: 'center', alignItems: 'center' }} onPress={async () => setShowInfo(true)}>
                                                            <Ionicons name="information-circle-outline" size={40} color="#7D00D1" />
                                                        </TouchableOpacity>
                                                    )}
                                                </View>

                                                <View style={styles.searchOutput}>
                                                    {isSearching && (
                                                        <ScrollView style={styles.searchOutput}>
                                                            {songList && songList.map(item => (
                                                                <TouchableOpacity key={item.uri} style={{ flexDirection: 'row', marginTop: 13 }}>
                                                                    <TouchableOpacity style={{ flexDirection: 'row', width: '90%' }} onPress={async () => await handlePlaySong(item.uri)}>
                                                                        <View>
                                                                            <Image style={{ width: 55, height: 55 }} source={{ uri: item.image }} />
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

                                                                    <TouchableOpacity style={{ paddingRight: 10, fontSize: 25, justifyContent: 'center', alignItems: 'center' }} onPress={async () => { setSongSelected({ song: item.name, uri: item.uri, artists: item.artist }); await showQueue(); await handleAddQueue(item.uri); }}>
                                                                        {/* <Text style={{color: "#7D00D1"}}>Queue</Text> */}
                                                                        <MaterialIcons name="queue-music" size={40} color="#7D00D1" />
                                                                    </TouchableOpacity>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </ScrollView>
                                                    )}
                                                </View>
                                            </View>

                                            <View style={styles.serverInfo}>
                                                {!isSearching && (
                                                    <Text style={styles.serverCode}><Text style={{ color: "#7D00D1", fontSize: 28 }}>Code: </Text>{theServerCode}</Text>
                                                )}
                                            </View>

                                            <View style={styles.song}>
                                                {!isSearching && (
                                                    <>
                                                        {currentSong.uri !== '' ? (
                                                            <>
                                                                <TouchableWithoutFeedback onPress={() => Linking.openURL(currentSong.albumURI)}>
                                                                    <Image source={{ uri: currentSong.image }} style={styles.image}></Image>
                                                                </TouchableWithoutFeedback>

                                                                <View style={styles.songInfo}>
                                                                    <TouchableWithoutFeedback onPress={() => Linking.openURL(currentSong.albumURI)}>
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

                                                                    <View style={{ alignItems: 'center', flexDirection: 'row', transform: [{ scaleX: 0.4 }, { scaleY: 0.4 }] }}>
                                                                        <TimeDisplay style={{ color: 'white', fontSize: 30, fontWeight: '500', paddingHorizontal: 10 }} milliseconds={timeStamp} />
                                                                        <Slider
                                                                            style={{ margin: 0, padding: 0, width: 725, height: 50 }}
                                                                            minimumValue={0}
                                                                            maximumValue={currentSong.duration}
                                                                            value={currentSong.timestamp}
                                                                            onValueChange={setTimeStamp}
                                                                            onSlidingStart={() => setSeeking(true)}
                                                                            onSlidingComplete={async (value) => { setSeeking(false); await handleSeek(value); }}
                                                                            minimumTrackTintColor="#FFFFFF"
                                                                            maximumTrackTintColor="#5E5E5E"
                                                                            step={1}
                                                                        />
                                                                        <TimeDisplay style={{ color: 'white', fontSize: 30, fontWeight: '500', paddingHorizontal: 10 }} milliseconds={currentSong.duration} />
                                                                    </View>


                                                                </View>


                                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 10 }}>
                                                                    <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center' }} onPress={async () => await handlePrev()}>
                                                                        <MaterialIcons style={styles.button} name="skip-previous" size={85} color="#7D00D1" />
                                                                    </TouchableOpacity>

                                                                    {isPaused ? (
                                                                        <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center' }} onPress={async () => await handleResume()}>
                                                                            <AntDesign style={styles.button} name="play" size={100} color="#7D00D1" />
                                                                        </TouchableOpacity>
                                                                    ) : (
                                                                        <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center' }} onPress={async () => await handlePause()}>
                                                                            <AntDesign style={styles.button} name="pausecircle" size={100} color="#7D00D1" />
                                                                        </TouchableOpacity>
                                                                    )}

                                                                    <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center' }} onPress={async () => await handleNext()}>
                                                                        <MaterialIcons style={styles.button} name="skip-next" size={85} color="#7D00D1" />
                                                                    </TouchableOpacity>
                                                                </View>
                                                            </>
                                                        ) : (

                                                            <>
                                                                <TouchableWithoutFeedback onPress={() => Linking.openURL("spotify://")}>
                                                                    <Image source={require('../images/spotify-icon.png')} style={styles.image} />
                                                                </TouchableWithoutFeedback>

                                                                <View style={styles.songInfo}>
                                                                    <Text style={styles.songName}>Spotify not Playing</Text>
                                                                    <Text style={styles.artist}>Please Start Playing Spotify</Text>
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
                                        <Text style={styles.serverCode}><Text style={{ color: "#7D00D1", fontSize: 28 }}>Code: </Text>{theServerCode}</Text>

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

                ) : (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator
                            animating={true}
                            size='large'
                            color="#7D00D1" // Set the color of the spinner
                        />
                    </View>
                )}



            </SafeAreaView>
        </LinearGradient>

    );
    /////////////////////////////////////////////////////////////////////////////////////////////////
}