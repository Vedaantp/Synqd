import * as React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, TextInput, ScrollView } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { router } from 'expo-router';

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
    const [songSelected, setSongSelected] = React.useState({ song: '', uri: '', artists: '' });
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
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
                setSongList(null);
                setSearchParam(null);

                sendSongRequest();
            }

        });

        newSocket.on("userTimedOut", ({ userId }) => {
            checkTimeOut(userId);
        });

        newSocket.on("heartbeatReceived", (data) => {
            console.log("Heartbeat received: ", data);
        });

        setSocket(newSocket);

        return () => {
            clearInterval(heartbeatInterval);
            newSocket.disconnect();
        };
    }, [])
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

        if (rejoin === "true") {
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
            heartbeatInterval = setInterval(() => {sendHeartbeat(newSocket, serverCode)}, 5000);
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

    };
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
    // screen

    // displays the server code, a countdown for the current phase, the current phase,
    //  a song search textbox, a search button for songs, a list of songs from the search,
    //  and a leave server button
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
    /////////////////////////////////////////////////////////////////////////////////////////////////
}


/////////////////////////////////////////////////////////////////////////////////////////////////
// styles

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
/////////////////////////////////////////////////////////////////////////////////////////////////