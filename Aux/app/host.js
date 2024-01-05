import * as React from 'react';
import { Stack } from "expo-router/stack";
import { Button, StyleSheet, AppState, Modal, Text, View, useColorScheme, StatusBar, TouchableOpacity, Alert, TextInput, ScrollView, Image, TouchableWithoutFeedback, Keyboard, Dimensions, Linking, ActivityIndicator } from "react-native";
import Slider from '@react-native-community/slider';
import LinearGradient from 'react-native-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { AntDesign } from '@expo/vector-icons';
import { refreshAsync } from 'expo-auth-session';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { Link, router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

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
    const [showCode, setShowCode] = React.useState(false);
    const scrollRef = React.useRef(null);
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    const tokenEndpoint = 'https://accounts.spotify.com/api/token';
    const clientId = '43d48850732744018aff88a5692d03d5';
    const insets = useSafeAreaInsets();
	const theme = useColorScheme();
    const { height: deviceHeight, width: deviceWidth } = Dimensions.get('window');
    let heartbeatInterval = null;
    let getCurrent = null;
    let sendInfo = null;
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // On mount functions

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
            getCurrent = setInterval(() => { getCurrentPlaying() }, 1000);
        });

        newSocket.on('updateUsers', (data) => {
            console.log('Users updated: ', data);
            setListUsers(data);
        });

        newSocket.on("hostRejoined", () => {
            console.log("Host rejoined");
            setConnected(true);
            heartbeatInterval = setInterval(() => { sendHeartbeat(newSocket) }, 60000);
            getCurrent = setInterval(() => { getCurrentPlaying() }, 1000);
        });

        newSocket.on('hostLeft', (data) => {
            console.log("Host left: ", data);
            router.push('/');
        });

        newSocket.on('hostTimedOut', (data) => {
            console.log("Host timed out: ", data);
            timedOut();
            router.push('/');
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
            } else if (timerIndex === 1) {
                setVotingPhase(true);
            } else if (timerIndex === -1) {
                console.log("No phases");
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
    // extra functions

    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };

    const showQueue = async () => {

        setShowAlert(true);

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

    const sliceData = (data, minSlice, isArray) => {
        if (data.length > minSlice) {
            if (isArray) {
                return data.slice(0, minSlice).join(', ') + ', ...';
            } else {
                return data.slice(0, minSlice) + ', ...';
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
            console.log("Host Reconnected");
            setTheServerCode(serverCode);

            socket.emit("updateHost", { username: username, userId: userId, serverCode: serverCode });
        } else {
            socket.emit('createServer', { username: username, userId: userId });
        }

    };

    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");
        
        if (socket) {
            socket.emit('end', { serverCode: serverCode, userId: userId });
            socket.emit('leaveServer', { serverCode: serverCode, userId: userId });
        }
        
        setConnected(false);

        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
    };

    const startServer = async (socket, serverCode) => {
        const userId = await getValue("userId");

        socket.emit("start", { serverCode: serverCode, userId: userId });
    };

    const joinError = async () => {
        setConnected(false);
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

        router.push('/');
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

            router.push('/');
        }
    };

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

            router.push('/');
        }

    };

    const searchSong = async () => {

        if (searchParam) {

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

                    console.log(songs);

                    setSongList(songs);
                    setSearchParam(null);

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
        setConnected(false);
    };

    const sendHeartbeat = async (socket) => {
        const serverCode = await getValue("serverCode");
        const userId = await getValue("userId");
        console.log("Sending heartbeat");
        socket.emit("heartbeat", { serverCode: serverCode, userId: userId });
    };

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
    // styles
    // const styles = StyleSheet.create({
    //     container: {
    //         flex: 1,
    //         padding: 0,
    //         margin: 0,
    //         top: 0,
    //         bottom: 0,
    //         // zIndex: 1
    //     },
    //     search: {
    //         flex: isSearching ? 1 : 0,
    //         flexDirection: 'column',
    //         alignItems: 'center',
    //         paddingTop: 10
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
    //         paddingLeft: 10
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
    //         marginTop: 40,
    //         flexDirection: 'column',
    //         alignItems: 'center',
    //     },
    //     serverCode: {
    //         fontWeight: 'bold',
    //         color: theme === 'light' ? 'black' : 'white', 
    //         fontSize: 28,
    //         // marginBottom: 30
    //     },
    //     song: {
    //         flex: isSearching ? 0 : 1,
    //         flexDirection: 'column',
    //         alignItems: 'center'
    //     },
    //     songScroll: {
    //         flex: 1,
    //         width: '100%',
    //         paddingHorizontal: 5,
    //         marginTop: 5,
            
    //     },
    //     songInfo: {
    //         flex: 0,
    //         flexDirection: 'column',
    //         alignItems: 'center',
    //         marginTop: 15,
    //         marginBottom: 20
    //     },
    //     songName: {
    //         // color: 'white',
    //         color: theme === 'light' ? "black" : 'white',
    //         fontSize: 17,
    //         fontWeight: 'bold'
    //     },
    //     artist: {
    //         // color: 'white',
    //         color: theme === 'light' ? "black" : 'white',
    //         fontSize: 13,
    //         fontWeight: 'bold'
    //     },
    //     button: {
    //         fontWeight: "bold",
    //         // marginHorizontal: 15,
    //         alignItems: 'center',
    //         justifyContent: 'center',
    //     },
    //     image: {
    //         width: .85 * deviceWidth,
    //         height: .85 * deviceWidth,
    //         marginTop: 25,
    //         marginBottom: 0,
    //         alignSelf: 'center'
    //     },
    //     info: {
    //         flex: 0,
    //         flexDirection: 'row',
    //         alignItems: 'center',
    //         justifyContent: 'flex-start'
    //     },
    //     infoHeader: {
    //         color: '#7D00D1',
    //         position: 'absolute',
    //         fontSize: 35,
    //         fontWeight: "bold",
    //         justifyContent: 'center',
    //         alignItems: 'center',
    //         alignSelf: 'center'
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
    //         // color: "white",
    //         color: theme === 'light' ? "black" : 'white',
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
    //     },
    //     alertText: {
    //         fontSize: 20,
    //         alignItems: 'center',
    //         justifyContent: 'center',
    //     },
    //     qrCodeContainer: {
    //         flex: 1,
    //         alignItems: 'center',
    //         alignSelf: 'center',
    //         justifyContent: 'center',
    //     },
    //     qrCode: {
    //         flex: 1,
    //         alignItems: 'center',
    //         alignSelf: 'center',
    //         justifyContent: 'center',
    //         backgroundColor: theme === 'light' ? "#191414" : '#FFFFFF',
    //     },
    // });

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            backgroundColor: theme === 'light' ? '#FFFFFF' : '#000000'
        },
        header: {
            flexDirection: 'row',
            marginTop: insets.top,
            marginLeft: insets.left, 
            marginRight: insets.right, 
            width: '100%',
            borderBottomWidth: 1,
            borderColor: theme === 'light' ? 'black' : 'white',
            paddingVertical: 10,
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
        main: {
            flex: 1,
            width: '100%',
            justifyContent: 'space-between'
        },
        playback: {
            flex: 1,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center'
        },
        albumCover: {
            width: 0.8 * deviceWidth,
            height: 0.8 * deviceWidth
        },
        playbackInfo: {
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            marginTop: '3%'
        },
        slider: { 
            transform: [{ scaleX: 0.5 }, { scaleY: 0.5 }],
            width: deviceWidth * 1.5,
        },
        sliderInfo: {
            marginTop: '-3%',
            width: '75%',
            flexDirection: "row",
            justifyContent: 'space-between'
        },
        playbackControls: {
            marginTop: '5%', 
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
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
                  elevation: 5, // This adds a shadow to the card for Android
                },
            }),
        }
    });

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // screen

    return (

        <View style={styles.container}>
                <View style={styles.header} >
                    <TouchableOpacity style={styles.exitButton} onPress={async () => await leaveServer()} >
                        <MaterialIcons name="exit-to-app" size={35} color={theme === 'light' ? 'black' : 'white'} />
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
                        <MaterialIcons name="people-alt" size={35} color={theme === 'light' ? 'black' : 'white'} />
                    </TouchableOpacity>
                </View>

                <View style={styles.main}>

                    <View style={styles.playback} >
                        <TouchableWithoutFeedback onPress={() => {
                            if (currentSong.image) {
                                Linking.openURL(currentSong.uri);
                            } else {
                                Linking.openURL('spotify://');
                            }
                        }}>
                            <Image  style={styles.albumCover} source={currentSong.image ? {uri :currentSong.image} : require("../images/spotify-icon.png")} />
                        </TouchableWithoutFeedback>
                        

                        <View style={styles.playbackInfo}>
                            <TouchableOpacity onPress={() => {
                                if (currentSong.uri) {
                                    Linking.openURL(currentSong.uri);
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
                            style={styles.slider}
                            minimumValue={0}
                            maximumValue={currentSong.duration}
                            value={currentSong.timestamp}
                            onValueChange={setTimeStamp}
                            onSlidingStart={() => setSeeking(true)}
                            onSlidingComplete={async (value) => { setSeeking(false); await handleSeek(value); }}
                            minimumTrackTintColor={theme === 'light' ? '#000000' : '#FFFFFF'}
                            maximumTrackTintColor={theme === 'light' ? '#A1A1A1' : "#5E5E5E"}
                            thumbTintColor={theme === 'light' ? 'black' : "white"}
                            step={1}
                        />
                                              
                        <View style={styles.sliderInfo}>
                            <TimeDisplay style={{ color: theme === 'light' ? 'black' : 'white', alignSelf: 'flex-start'}} milliseconds={currentSong.timestamp} />
                            <TimeDisplay style={{ color: theme === 'light' ? 'black' : 'white', alignSelf: 'flex-end'}} milliseconds={currentSong.duration} />
                        </View>
                        
                        
                        <View style={styles.playbackControls}>
                            <TouchableOpacity style={{paddingHorizontal: '5%'}} onPress={async () => await handlePrev()}>
                                <MaterialIcons name="skip-previous" size={75} color={ theme === 'light' ? 'black' : 'white' } />
                            </TouchableOpacity>

                            {!isPaused ? (
                                <TouchableOpacity style={{paddingHorizontal: '5%'}} onPress={async () => await handlePause()}>
                                    <MaterialIcons name="pause" size={75} color={ theme === 'light' ? 'black' : 'white' } />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={{paddingHorizontal: '5%'}} onPress={async () => await handleResume()}>
                                    <MaterialIcons name="play-arrow" size={75} color="black" />
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity style={{paddingHorizontal: '5%'}} onPress={async () => await handleNext()}>
                                <MaterialIcons name="skip-next" size={75} color={ theme === 'light' ? 'black' : 'white' } />
                            </TouchableOpacity>

                        </View>
                    </View>
                </View>

            <TouchableOpacity onS onPress={() => router.push('/queueModal')} style={styles.queueCard} >
                <Text style={{color: theme === 'light' ? 'black' : 'white', fontSize: 20 }} >Queue</Text>
            </TouchableOpacity>
        </View>

        // <LinearGradient
        //     colors={theme === 'light' ? ['#FFFFFF', '#FFFFFF'] : ['rgb(25, 20, 20)', 'rgb(25, 20, 20)']}
        //     start={{ x: 0, y: 0 }}
        //     end={{ x: 0, y: 1 }}
        //     style={styles.container}
        // >
        //     <SafeAreaView style={styles.container}>
        //         <StatusBar />


        //         {connected ? (

        //             <TouchableWithoutFeedback onPress={() => {
        //                 if (isSearching) {
        //                     Keyboard.dismiss();

        //                     if (!searchParam) {
        //                         setSearching(false);
        //                     }
        //                 }
        //             }}>
        //                 <>
        //                     {showAlert && (
        //                         <CustomAlert
        //                             message="Song queued!"
        //                         />
        //                     )}

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

        //                                             <TextInput
        //                                                 style={styles.input}
        //                                                 placeholder="Search for a song"
        //                                                 // placeholderTextColor={'white'}
        //                                                 placeholderTextColor={theme === 'light' ? 'black' : 'white'}
        //                                                 value={searchParam}
        //                                                 onChangeText={setSearchParam}
        //                                                 keyboardAppearance={theme}
        //                                                 returnKeyType='search'
        //                                                 onSubmitEditing={() => searchSong()}
        //                                                 onFocus={() => setSearching(true)}
        //                                                 clearTextOnFocus={true}
        //                                             />

        //                                             {!isSearching && (
        //                                                 <TouchableOpacity style={{ paddingLeft: 10, paddingRight: insets.right, width: '20%', justifyContent: 'center', alignItems: 'center' }} onPress={async () => setShowInfo(true)}>
        //                                                     <Ionicons name="people" size={40} color="#7D00D1" />
        //                                                 </TouchableOpacity>
        //                                             )}
        //                                         </View>

        //                                         <View style={styles.searchOutput}>
        //                                             {isSearching && (
        //                                                 <ScrollView showsVerticalScrollIndicator={false} style={styles.searchOutput}>
        //                                                     {songList && songList.map(item => (
        //                                                         <TouchableOpacity key={item.uri} activeOpacity={1} style={{ flexDirection: 'row', marginTop: 13 }}>
        //                                                             <TouchableOpacity activeOpacity={1} style={{ flexDirection: 'row', width: '90%' }} onPress={async () => {}}>
        //                                                                 <View>
        //                                                                     <Image style={{ width: 55, height: 55 }} source={{ uri: item.image }} />
        //                                                                 </View>
        //                                                                 <View style={styles.searchSongInfo}>
        //                                                                     <Text style={{ fontSize: 18, color: theme === 'light' ? 'black' : 'white', alignItems: 'flex-start' }}>{
        //                                                                         item.name.length <= 25
        //                                                                             ? item.name
        //                                                                             : item.name.slice(0, 25) + '...'
        //                                                                     }</Text>
        //                                                                     <Text style={{ fontSize: 15, color: theme === 'light' ? 'black' : 'white', alignItems: 'flex-start' }}>{
        //                                                                         item.artist.length <= 2
        //                                                                             ? item.artist.join(', ')
        //                                                                             : item.artist.slice(0, 2).join(', ') + ', ...'
        //                                                                     }</Text>
        //                                                                 </View>
        //                                                             </TouchableOpacity>

        //                                                             <TouchableOpacity style={{ paddingRight: 10, fontSize: 25, justifyContent: 'center', alignItems: 'center' }} onPress={async () => { setSongSelected({ song: item.name, uri: item.uri, artists: item.artist }); await showQueue(); await handleAddQueue(item.uri); }}>
        //                                                                 <MaterialIcons name="queue-music" size={40} color="#7D00D1" />
        //                                                             </TouchableOpacity>
        //                                                         </TouchableOpacity>
        //                                                     ))}
        //                                                 </ScrollView>
        //                                             )}
        //                                         </View>
        //                                     </View>

        //                                     <View style={styles.song}>
        //                                         {!isSearching && (
        //                                             <>
        //                                                 {currentSong.uri !== '' ? (
        //                                                     <>
        //                                                         <ScrollView 
        //                                                             vertical
        //                                                             snapToInterval={750} // Adjust this value based on your content size
        //                                                             decelerationRate="fast"
        //                                                             style={styles.songScroll}
        //                                                             showsVerticalScrollIndicator={false}
        //                                                             bounces={false}
        //                                                             ref={scrollRef}
        //                                                         >
        //                                                             <TouchableWithoutFeedback onPress={() => Linking.openURL(currentSong.albumURI)}>
        //                                                                 <Image source={{ uri: currentSong.image }} style={styles.image}></Image>
        //                                                             </TouchableWithoutFeedback>

        //                                                             <View style={styles.songInfo}>
        //                                                                 <TouchableWithoutFeedback activeOpacity={1} onPress={() => Linking.openURL(currentSong.albumURI)}>
        //                                                                     <Text style={styles.songName}>{
        //                                                                         currentSong.name.length <= 40
        //                                                                             ? currentSong.name
        //                                                                             : currentSong.name.slice(0, 40) + '...'
        //                                                                     }</Text>
        //                                                                 </TouchableWithoutFeedback>

        //                                                                 <TouchableWithoutFeedback activeOpacity={1} onPress={() => Linking.openURL(currentSong.artistsURI[0])}>
        //                                                                     <Text style={styles.artist}>{
        //                                                                         currentSong.artists.length <= 3
        //                                                                             ? currentSong.artists.join(", ")
        //                                                                             : currentSong.artists.slice(0, 3).join(', ') + ', ...'}</Text>
        //                                                                 </TouchableWithoutFeedback>

        //                                                                 <View style={{ alignItems: 'center', flexDirection: 'row', transform: [{ scaleX: 0.4 }, { scaleY: 0.4 }] }}>
        //                                                                     <TimeDisplay style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 30, fontWeight: '500', paddingHorizontal: 10 }} milliseconds={timeStamp} />
        //                                                                     <Slider
        //                                                                         style={{ margin: 0, padding: 0, width: 725, height: 50 }}
        //                                                                         minimumValue={0}
        //                                                                         maximumValue={currentSong.duration}
        //                                                                         value={currentSong.timestamp}
        //                                                                         onValueChange={setTimeStamp}
        //                                                                         onSlidingStart={() => setSeeking(true)}
        //                                                                         onSlidingComplete={async (value) => { setSeeking(false); await handleSeek(value); }}
        //                                                                         // minimumTrackTintColor="#FFFFFF"
        //                                                                         minimumTrackTintColor={theme === 'light' ? '#000000' : '#FFFFFF'}
        //                                                                         maximumTrackTintColor={theme === 'light' ? '#A1A1A1' : "#5E5E5E"}
        //                                                                         thumbTintColor={theme === 'light' ? 'black' : "white"}
        //                                                                         step={1}
        //                                                                     />
        //                                                                     <TimeDisplay style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 30, fontWeight: '500', paddingHorizontal: 10 }} milliseconds={currentSong.duration} />
        //                                                                 </View>


        //                                                             </View>

        //                                                             <View style={{ flexDirection: 'row', justifyContent: 'space-between'}}>
        //                                                                 <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center', marginHorizontal: 15 }} onPress={async () => await handlePrev()}>
        //                                                                     <MaterialIcons style={styles.button} name="skip-previous" size={85} color={theme === 'light' ? 'black' : 'white'} />
        //                                                                 </TouchableOpacity>

        //                                                                 {isPaused ? (
        //                                                                     <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center', marginHorizontal: 15 }} onPress={async () => await handleResume()}>
        //                                                                         <AntDesign style={styles.button} name="play" size={100} color={theme === 'light' ? 'black' : 'white'} />
        //                                                                     </TouchableOpacity>
        //                                                                 ) : (
        //                                                                     <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center', marginHorizontal: 15 }} onPress={async () => await handlePause()}>
        //                                                                         <AntDesign style={styles.button} name="pausecircle" size={100} color={theme === 'light' ? 'black' : 'white'} />
        //                                                                     </TouchableOpacity>
        //                                                                 )}

        //                                                                 <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center', marginHorizontal: 15 }} onPress={async () => await handleNext()}>
        //                                                                     <MaterialIcons style={styles.button} name="skip-next" size={85} color={theme === 'light' ? 'black' : 'white'} />
        //                                                                 </TouchableOpacity>
        //                                                             </View>
                                                                    
        //                                                             <View style={{ marginTop: 100, flex: 1, height: 750}}>
        //                                                                 <TouchableOpacity activeOpacity={1} onPress={() => {
        //                                                                     scrollRef.current.scrollTo({y: 750, animated: true});
        //                                                                 }}>
        //                                                                     <Text style={{fontSize: 25, alignSelf: 'center', color: theme === 'light' ? 'black' : 'white', marginVertical: 40}}>Queue</Text>
        //                                                                 </TouchableOpacity>
        //                                                             </View>
        //                                                         </ScrollView>
                                                                
        //                                                     </>
        //                                                 ) : (

        //                                                     <>
        //                                                         <TouchableWithoutFeedback onPress={() => Linking.openURL("spotify://")}>
        //                                                             <Image source={require('../images/spotify-icon.png')} style={styles.image} />
        //                                                         </TouchableWithoutFeedback>

        //                                                         <View style={styles.songInfo}>
        //                                                             <Text style={styles.songName}>Spotify not Playing</Text>
        //                                                             <Text style={styles.artist}>Please Start Playing Spotify</Text>
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
        //                                 onPress={() => {setShowInfo(false); setShowCode(false);}}>
        //                                 <Ionicons name="arrow-back" size={40} color="#7D00D1" />
        //                             </TouchableOpacity>

        //                             <Text style={styles.infoHeader}>Server Info</Text>

        //                             {showCode && (
        //                                 <View style={{ borderRadius: 25, backgroundColor: theme === 'light' ? 'rgba(0, 0, 0, .5)' : 'rgba(255, 255, 255, 0.5)', zIndex: 2, width: 300, height: 300, position: 'absolute', alignItems: 'center', alignSelf: 'center', justifyContent: 'center', top: '25%'}} >
        //                                     <QRCode value={theServerCode} size={200} />
        //                                 </View>
        //                             )}

        //                             <View style={styles.serverInfo}>
        //                                 <TouchableWithoutFeedback onPress={() => setShowCode(false)}>
        //                                     <>
        //                                     <TouchableOpacity onPress={() => setShowCode(true)} style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center'}}>
        //                                         <Text style={styles.serverCode}>{theServerCode}</Text>
        //                                         {!showCode && (
        //                                             <QRCode value={theServerCode} size={25} />
        //                                         )} 
        //                                     </TouchableOpacity>

        //                                     <Text style={styles.hostLabel}>Host:</Text>

        //                                     {listUsers.host && (
        //                                         <Text style={styles.users}>{listUsers.host.username}</Text>
        //                                     )}

        //                                     <Text style={styles.membersLabel}>Members: </Text>
        //                                     {listUsers.users && listUsers.users.map((user, index) => (
        //                                         <Text style={styles.users} key={index}>{user.username}</Text>
        //                                     ))}
        //                                     </>
        //                                 </TouchableWithoutFeedback>
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

    );
    /////////////////////////////////////////////////////////////////////////////////////////////////
}