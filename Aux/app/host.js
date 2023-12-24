import * as React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { router } from 'expo-router';

export default function Page() {

    const [socket, setSocket] = React.useState(null);
    const [theServerCode, setTheServerCode] = React.useState(null);
    const [listUsers, setListUsers] = React.useState({ users: [], host: {} });
    const [countdown, setCountdown] = React.useState(null);
    const [votingPhase, setVotingPhase] = React.useState(false);
    const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    let heartbeatInterval = null;

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

            heartbeatInterval = setInterval(() => {sendHeartbeat(newSocket, serverCode)}, 5000);
        });

        newSocket.on('updateUsers', (data) => {
            console.log('Users updated: ', data);
            setListUsers(data);
        });

        newSocket.on("hostRejoined", () => {
            console.log("Host rejoined");
            heartbeatInterval = setInterval(() => {sendHeartbeat(newSocket)}, 5000);
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

        newSocket.on("heartbeatReceived", (data) => {
            console.log("Heartbeat received: ", data);
        });

        setSocket(newSocket);

        return () => {
            clearInterval(heartbeatInterval);
            newSocket.disconnect();
        };
    }, [])

    // function to get the values from async storage
    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };

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
            console.log("User Reconnected");
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

        socket.emit('end', {serverCode: serverCode, userId: userId});
        socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
    };

    // if the host timed out it will remove any associated data with the server
    // will not allow for rejoin
    // will destroy the server
    const timedOut = async () => {
        await AsyncStorage.removeItem("serverCode");
        await AsyncStorage.setItem("hosting", "false");
        await AsyncStorage.setItem("rejoining", "false");
    };

    // once the host creates the server and server code, it will start the countdown timer for the phases
    const startServer = async (socket, serverCode) => {
        const userId = await getValue("userId");

        socket.emit("start", {serverCode: serverCode, userId: userId});
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

    // function that is called once host successfully joined server
    // sends a heart beat to server to avoid timeout
    const sendHeartbeat = async (socket) => {
        const serverCode = await getValue("serverCode");
        const userId = await getValue("userId");
        console.log("Sending heartbeat");
        socket.emit("heartbeat", { serverCode: serverCode, userId: userId });
    };

    // displays the server code, the countdown, the phase, the list of users in the server, and a leave button
    return (
        <View style={styles.container}>
            <Text>Server Code: {theServerCode}</Text>

            { countdown && (
                <Text>
                    {votingPhase ? "Vote the song you want!" : "Search for your song!"}
                </Text>
            )}

            { countdown && (
                <Text>Countdown: {countdown} seconds</Text>
            )}

            {listUsers.host && (
                <Text>{listUsers.host.username}</Text>
            )}

            {listUsers.users && listUsers.users.map((user, index) => (
                <Text key={index}>{user.username}</Text>
            ))}

            <TouchableOpacity onPress={() => leaveServer()}>
                <Text style={styles.button}>End Session</Text>
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