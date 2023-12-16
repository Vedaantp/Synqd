import * as React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { router } from 'expo-router';

export default function Page() {

    const [socket, setSocket] = React.useState(null);
    const [theServerCode, setTheServerCode] = React.useState(null);
	const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';

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
		});

		newSocket.on('userJoined', (data) => {
			console.log('User joined: ', data);
		});

        newSocket.on('hostLeft', (data) => {
            console.log("Host left: ", data);
            router.replace('/home');
        });

        newSocket.on('userLeft', (data) => {
            console.log("Host left: ", data);
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

    const hostServer = async (socket) => {
		const username = await getValue("username");
		const userId = await getValue("userId");

		socket.emit('createServer', { username: username, userId: userId, host: true });
	};

    const leaveServer = async () => {
        const userId = await getValue("userId");
        const serverCode = await getValue("serverCode");

        console.log(userId);
        console.log(theServerCode);

        socket.emit('leaveServer', { serverCode: serverCode, userId: userId });
    };

	return (
		<View style={styles.container}>
            {/* {getValue("serverCode") && (
                <Text>{getValue("serverCode")}</Text>
            )} */}

            <TouchableOpacity onPress={() => leaveServer() }>
				<Text style={styles.button}>Leave</Text>
			</TouchableOpacity>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'center',
		alignItems: "center",
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