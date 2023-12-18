import * as React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, TextInput, ScrollView } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { router } from 'expo-router';

export default function Page() {

    const [socket, setSocket] = React.useState(null);
    const [listUsers, setListUsers] = React.useState({users: [], host: {}});
    const [theServerCode, setTheServerCode] = React.useState(null);
    const [countdown, setCountdown] = React.useState(null);
    const [votingPhase, setVotingPhase] = React.useState(false);
    const [searchParam, setSearchParam] = React.useState(null);
    const [songList, setSongList] = React.useState(null);
    const [songSelected, setSongSelected] = React.useState(null);
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
        
        if (serverCode !== null) {
            setTheServerCode(serverCode);
        }

		socket.emit('joinServer', { serverCode: serverCode, username: username, userId: userId });
	};

    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        socket.emit('leaveServer', { serverCode: serverCode, userId: userId });

        await AsyncStorage.removeItem("serverCode");

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


    // Add a verifier to make sure the access token is not expired. 
    // If it is then set any data associated with the user to null.
    // Then disconnect them from the server and then send them back to the login screen.
    // Send alert to let user know why this is happening.
    const searchSong = async () => {

        if (searchParam) {

            const accessToken = await getValue("accessToken");
            const urlFriendlySearchParam = encodeURIComponent(searchParam);
            const url = `https://api.spotify.com/v1/search?q=${searchParam}&type=track&market=US`;
            console.log(url);

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
                    isPlayable: item.is_playable
                }))

                setSongList(songs);

            })
            .catch((error) => {
                console.log("Search error: ", error);
            })
        } else {

            setSearchParam(null);

            Alert.alert(
                'Search Error',
                'Please enter something in the search field before pressing search.',
                [
                  { text: 'OK' }
                ],
                { cancelable: false }
              );
        }
    };

    return (
        
        <View style={styles.container}>
            <Text>Server Code: {theServerCode}</Text>

            { countdown && (
                <>
                    <Text>Countdown: {countdown} seconds</Text>
                    <Text>
                        {votingPhase ? "Vote the song you want!" : "Search for your song!"}
                    </Text>
                </>
            )}

            { countdown && !votingPhase && (
                <>
                    <TextInput
                        style={styles.input}
                        placeholder="Search for a song"
                        value={searchParam}
                        onChangeText={setSearchParam}
                    />

                    <TouchableOpacity onPress={() => searchSong()}>
                        <Text style={styles.button}>Search Song</Text>
                    </TouchableOpacity>

                    <ScrollView style={{flex: 0}}>
                        { songList && songList.map(item => (
                            <TouchableOpacity key={item.uri} onPress={() => setSongSelected(item.uri)}>
                                <Text style={[{color: songSelected === item.uri ? 'green' : 'black'}]}>{item.name} - {item.uri}</Text>
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