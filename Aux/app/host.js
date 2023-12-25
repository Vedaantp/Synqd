import * as React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, TextInput, ScrollView, Image, TouchableWithoutFeedback, Keyboard, Dimensions } from "react-native";
import { refreshAsync } from 'expo-auth-session';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { router } from 'expo-router';

export default function Page() {


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // Variables

    const [socket, setSocket] = React.useState(null);
    const [theServerCode, setTheServerCode] = React.useState(null);
    const [listUsers, setListUsers] = React.useState({ users: [], host: {} });
    const [songList, setSongList] = React.useState(null);
    const [searchParam, setSearchParam] = React.useState(null);
    const [songSelected, setSongSelected] = React.useState({ name: '', uri: '', artists: '', isPlayable: '' });
    const [currentSong, setCurrentSong] = React.useState({ name: '', uri: '', image: '', artists: '', timestamp: 0 });
    const [isPaused, setPaused] = React.useState(false);
    const [isSearching, setSearching] = React.useState(false);
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    const {height: deviceHeight, width: deviceWidth} = Dimensions.get('window');
    let heartbeatInterval = null;
    let getCurrent = null;
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

            heartbeatInterval = setInterval(() => { sendHeartbeat(newSocket, serverCode) }, 60000);
            getCurrent = setInterval(() => { getCurrentPlaying() }, 500);
        });

        newSocket.on('updateUsers', (data) => {
            console.log('Users updated: ', data);
            setListUsers(data);
        });

        newSocket.on("hostRejoined", () => {
            console.log("Host rejoined");
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

        newSocket.on("heartbeatReceived", (data) => {
            console.log("Heartbeat received: ", data);
        });

        setSocket(newSocket);

        getCurrentPlaying();

        return () => {
            clearInterval(heartbeatInterval);
            clearInterval(getCurrent);
            newSocket.disconnect();
        };
    }, [])
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
                refreshAccessToken();
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
            validateAuth();

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
                        artist: (item.artists.map(artistItems => artistItems.name)).join(', ')
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
        validateAuth();

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
                    artists: (data.item.artists.map(artist => artist.name)).join(', '),
                    uri: data.item.uri,
                    timestamp: data.progress_ms
                };

                if (data.is_playing) {
                    setPaused(false);
                } else {
                    setPaused(true);
                }

                // if (currentSong.uri !== song.uri) {
                //     setCurrentSong(song);
                // }

                setCurrentSong(song);
            })
            .catch((error) => {
                setCurrentSong({ name: '', image: '', artists: '', uri: '' })
            })
    };

    const handleResume = async () => {

        // verify accessToken and if not valid refresh it
        validateAuth();

        const accessToken = await getValue("accessToken");
        const endpoint = 'https://api.spotify.com/v1/me/player/play';

        const spotifyParams = {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                position_ms: currentSong.timestamp
            })
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
        validateAuth();

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
        validateAuth();

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
        validateAuth();

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
    // styles
    const styles = StyleSheet.create({
        container: {
            flex: 1,
            padding: 0,
            margin: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'lightgray',
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
            height: 30,
            width: 280,
            borderColor: 'gray',
            borderWidth: 1,        
        },
        serverInfo: {
            flex: 0,
            flexDirection: 'column',
            alignItems: 'center',
        },
        song: {
            flex: isSearching ? 0 : 1,
            flexDirection: 'column',
            alignItems: 'center'
        },
        button: {
            fontWeight: "bold",
            fontSize: 25,
            color: "blue",
            paddingHorizontal: 30,
        },
        image: {
            width: .75 * deviceWidth,
            height: .75 * deviceWidth,
            marginTop: 75,
            marginBottom: 10            
        },
        
    });
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // screen

    // displays the server code, the countdown, the phase, the list of users in the server, a leave button, 
    // a search box to find a song, a search button, a label that tells what song user selected, and a list of
    // songs from search
    return (
        <SafeAreaView style={styles.container}>
            <TouchableWithoutFeedback style={styles.container} onPress={() => {
                if (isSearching) {
                    Keyboard.dismiss()
                }
            }}>
                <View style={styles.container}>
                    {theServerCode && (
                        <>
                            <View style={styles.search}>
                                <View style={styles.searchInput}>
                                    { isSearching && (
                                        <TouchableOpacity style={{paddingLeft: 10, paddingRight: 10, width: '20%'}} onPress={() => {
                                            setSearching(false);
                                            setSearchParam(null);
                                            setSongList(null);
                                            Keyboard.dismiss();
                                            }}>
                                            <Text style={styles.backButton}>Back</Text>
                                        </TouchableOpacity>
                                    )}

                                    { !isSearching && (
                                        <TouchableOpacity style={{paddingLeft: 10, paddingRight: 10, width: '20%'}} onPress={() => leaveServer()}>
                                            <Text style={styles.leaveButton}>End</Text>
                                        </TouchableOpacity>
                                    )}
                                    
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Search for a song"
                                        value={searchParam}
                                        onChangeText={setSearchParam}
                                        returnKeyType='go'
                                        onSubmitEditing={() => searchSong()}
                                        onFocus={() => setSearching(true)}
                                    />
                                </View>

                                <View style={styles.searchOutput}>
                                    { isSearching && (
                                        <ScrollView>
                                            {songList && songList.map(item => (
                                                <TouchableOpacity key={item.uri} onPress={() => setSongSelected({ song: item.name, uri: item.uri, artists: item.artist })}>
                                                    <Text style={[{ color: songSelected.uri === item.uri ? 'green' : 'black' }]}>{item.name} - {item.artist}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    )}
                                </View>
                            </View>

                            <View style={styles.serverInfo}>
                                { !isSearching && (
                                    <>
                                        <Text>{theServerCode}</Text>

                                        {songSelected.uri !== '' && (
                                            <Text>Song Selected: <Text style={{ color: "green" }}>{songSelected.song} - {songSelected.artists}</Text></Text>
                                        )}
            
                                        {listUsers.host && (
                                            <Text>{listUsers.host.username}</Text>
                                        )}
            
                                        {listUsers.users && listUsers.users.map((user, index) => (
                                            <Text key={index}>{user.username}</Text>
                                        ))}
                                    </>
                                )}
                            </View>

                            <View style={styles.song}>
                                {!isSearching && (
                                    <>
                                        {currentSong.uri !== '' && (
                                            <>
                                                <Image source={{ uri: currentSong.image }} style={styles.image}></Image>
                                                <Text>{currentSong.name}</Text>
                                                <Text>{currentSong.artists}</Text>
                                            </>

                                        )}

                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 10 }}>
                                            <TouchableOpacity onPress={() => handlePrev()}>
                                                <Text style={styles.button}>Prev</Text>
                                            </TouchableOpacity>

                                            {isPaused ? (
                                                <TouchableOpacity onPress={() => handleResume()}>
                                                    <Text style={styles.button}>Resume</Text>
                                                </TouchableOpacity>
                                            ) : (
                                                <TouchableOpacity onPress={() => handlePause()}>
                                                    <Text style={styles.button}>Pause</Text>
                                                </TouchableOpacity>
                                            )}

                                            <TouchableOpacity onPress={() => handleNext()}>
                                                <Text style={styles.button}>Next</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                )}
                            </View>
                        </>
                    )}
                </View>
            </TouchableWithoutFeedback>
        </SafeAreaView>

    );
    /////////////////////////////////////////////////////////////////////////////////////////////////
}