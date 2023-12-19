import * as React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, TextInput, ScrollView } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { router } from 'expo-router';

export default function Page() {

    const [socket, setSocket] = React.useState(null);
    const [listUsers, setListUsers] = React.useState({ users: [], host: {} });
    const [theServerCode, setTheServerCode] = React.useState(null);
    const [countdown, setCountdown] = React.useState(null);
    const [votingPhase, setVotingPhase] = React.useState(false);
    const [searchParam, setSearchParam] = React.useState(null);
    const [songList, setSongList] = React.useState(null);
    const [songSelected, setSongSelected] = React.useState({ song: '', uri: '', artists: '' });
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';

    React.useEffect(() => {

        const newSocket = io(serverUrl);

        newSocket.on('connect', () => {
            console.log('Connected to server');
            joinServer(newSocket);

        });

        newSocket.on('userJoined', (data) => {
            console.log('User joined: ', data);
            setListUsers(data);
        });

        newSocket.on('updateUsers', (data) => {
            console.log('User joined: ', data);
            setListUsers(data);
        });

        newSocket.on('hostLeft', (data) => {
            console.log("Host left: ", data);
            hostLeft();
        });

        newSocket.on('userLeft', (data) => {
            console.log("User left: ", data);
            setListUsers(data);
        });

        newSocket.on("leaveError", (data) => {
            console.log("Leave error: ", data);
        });

        newSocket.on("joinError", (data) => {
            console.log("Join error: ", data);
            joinError();
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
                setSongList(null);
                setSearchParam(null);

                sendSongRequest();
            }

        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [])

    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };

    const joinServer = async (socket) => {
        const username = await getValue("username");
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");
        const rejoin = await getValue("rejoining");
        await AsyncStorage.setItem("hosting", "false");

        if (rejoin === 'true') {
            console.log("User Reconnected");
            setTheServerCode(serverCode);
            // implement feature in the server to update the username of member if it changed
            // use that feature to make a updateUser call on client side
            socket.emit('updateUser', { username: username, userId: userId, serverCode: serverCode });
        } else {
            if (serverCode !== null) {
                setTheServerCode(serverCode);
            }
    
            socket.emit('joinServer', { serverCode: serverCode, username: username, userId: userId });
        }
    };

    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");

        router.replace('/home');
    };

    const hostLeft = async () => {
        await AsyncStorage.removeItem("serverCode");
        router.replace('/home');
    };

    const serverFull = async () => {
        await AsyncStorage.removeItem("serverCode");

        Alert.alert(
            'Server Full',
            'The server you are trying to join is currently full right now. Please try again later. Thank you.',
            [
                { text: 'OK' }
            ],
            { cancelable: false }
        );
        console.assert("Server is full");
        router.replace('/home');
    };

    const joinError = async () => {
        await AsyncStorage.removeItem("serverCode");

        Alert.alert(
            'Join Error',
            'The server you are trying to join is does not exist. Please enter the correct server code provided by the host.',
            [
                { text: 'OK' }
            ],
            { cancelable: false }
        );
        console.assert("Server is full");
        router.replace('/home');
    };

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
            // do login path
            const userId = await getValue("userId");
            const serverCode = await getValue("serverCode");

            socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

            await AsyncStorage.removeItem("serverCode");
            await AsyncStorage.removeItem("accessToken");

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

            const accessToken = await getValue("accessToken");
            const url = `https://api.spotify.com/v1/search?q=${searchParam}&type=track&market=US`;

            // verify accessToken and if not valid refresh it
            validateAuth();

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
                        artist: item.artists.map(artistItems => artistItems.name)
                    }))

                    setSongList(songs);

                })
                .catch((error) => {
                    console.log("Search error: ", error);
                })
        } else {

            setSearchParam(null);
            setSongList(null);
        }
    };

    const sendSongRequest = async () => {

    };

    return (

        <View style={styles.container}>
            <Text>Server Code: {theServerCode}</Text>

            {countdown && (
                <>
                    <Text>Countdown: {countdown} seconds</Text>
                    <Text>
                        {votingPhase ? "Vote the song you want!" : "Search for your song!"}
                    </Text>
                </>
            )}

            {countdown && !votingPhase && (
                <>
                    {songSelected.uri !== '' && (
                        <Text>Song Selected: <Text style={{ color: "green" }}>{songSelected.song} - {songSelected.artists}</Text></Text>
                    )}

                    <TextInput
                        style={styles.input}
                        placeholder="Search for a song"
                        value={searchParam}
                        onChangeText={setSearchParam}
                        returnKeyType='go'
                        onSubmitEditing={() => searchSong()}
                    />

                    <TouchableOpacity onPress={() => searchSong()}>
                        <Text style={styles.button}>Search Song</Text>
                    </TouchableOpacity>

                    <ScrollView style={{ flex: 0 }}>
                        {songList && songList.map(item => (
                            <TouchableOpacity key={item.uri} onPress={() => setSongSelected({ song: item.name, uri: item.uri, artists: item.artist.join(', ') })}>
                                <Text style={[{ color: songSelected.uri === item.uri ? 'green' : 'black' }]}>{item.name} - {item.artist.join(', ')}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </>
            )}

            {/* {listUsers.host && (
                <Text>{listUsers.host.username}</Text>
            )}

            {listUsers.users && listUsers.users.map((user, index) => (
                <Text key={index}>{user.username}</Text>
            ))} */}

            <TouchableOpacity onPress={() => leaveServer()}>
                <Text style={styles.button}>Leave</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        // flex: 1,
        // justifyContent: 'center',
        // alignItems: "center",
    },
    button: {
        fontWeight: "bold",
        fontSize: 25,
        color: "blue",
    },
    image: {
        width: 200,
        height: 200,
        marginVertical: 10,
    },
    input: {
        height: 40,
        borderColor: 'gray',
        borderWidth: 1,
        marginBottom: 10,
        paddingHorizontal: 10,
    },
});  