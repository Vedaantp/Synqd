import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Image, TextInput } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { router } from 'expo-router';

export default function Page() {

	const [imageUrl, setImageUrl] = React.useState(null);
	const [socket, setSocket] = React.useState(null);
	const [serverCode, setServerCode] = React.useState(null);
	const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';

	// React.useEffect(() => {
	// 	// apiCall();

	// 	const getImage = async () => {
	// 		setImageUrl(await getValue("userImage"));
	// 	};

	// 	getImage();

	// 	const newSocket = io(serverUrl);

	// 	newSocket.on('connect', () => {
	// 		console.log('Connected to server');
	// 	});

	// 	newSocket.on('serverCreated', ({ serverCode }) => {
	// 		console.log('Server created with code: ', serverCode);
	// 	});

	// 	newSocket.on('userJoined', (data) => {
	// 		console.log('User joined:', data);
	// 	});

	// 	setSocket(newSocket);

	// 	return () => {
	// 		newSocket.disconnect();
	// 	};
	// }, [])

	const getValue = async (key) => {
		try {
			const value = await AsyncStorage.getItem(key);
			return value;

		} catch (error) {
			console.error("Get value error: ", error);
		}
	};

	const apiCall = async () => {
		const accessToken = await getValue("accessToken");

		await fetch('https://api.spotify.com/v1/me', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			}
		})
			.then((response) => response.json())
			.then((data) => {
				console.log("User data: ", data);
				setImageUrl(data.images[0].url);
				AsyncStorage.setItem("username", data.display_name);
				AsyncStorage.setItem("userId", data.id);
			})
			.catch((error) => {
				console.log("Fetch error: ", error);
			})
	};

	const hostServer = async () => {
		const username = await getValue("username");
		const userId = await getValue("userId");

		console.log(username);
		console.log(userId);

		socket.emit('createServer', { username: username, userId: userId, host: true });
	};

	const joinServer = async () => {
		const username = await getValue("username");
		const userId = await getValue("userId");

		socket.emit('joinServer', { serverCode: serverCode, username: username, userId: userId, host: false });
	};

	const getServerAmount = async () => {

		try {
			const response = await fetch(`${serverUrl}/activeServers`);

			if (response.ok) {
				const result = await response.json();

				if (result) {
					console.log('Num servers:', result.numberOfServers);
				} else {
				}
			} else {
				console.log('Failed to get users. Server responded with:', response.status);
			}
		} catch (error) {
			console.error('Error getting users:', error.message);
		}
	};

	const getUsers = async (serverCode) => {

		try {
			const response = await fetch(`${serverUrl}getUsers/${serverCode}`);

			if (response.ok) {
				const result = await response.json();
				if (result.success) {
					const users = result.users;
					console.log('List of users:', users);
				} else {
					console.log(`Failed to get users: ${result.message}`);
				}
			} else {
				console.log('Failed to get users. Server responded with:', response.status);
			}
		} catch (error) {
			console.error('Error getting users:', error.message);
		}
	};

	const leaveServer = async () => {
		const serverCode = 276766;
		const userId = await getValue("userId");

		try {
			const response = await fetch(`${serverUrl}leaveServer`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ serverCode, userId }),
			});

			if (response.ok) {
				const result = await response.json();
				if (result.success) {
					console.log('Successfully left the server');
				} else {
					console.log(`Failed to leave the server: ${result.message}`);
				}
			} else {
				console.log('Failed to leave the server. Server responded with:', response.status);
			}
		} catch (error) {
			console.error('Error leaving the server:', error.message);
		}
	};

	return (
		<View style={styles.container}>
			{imageUrl && (
				<Image style={styles.image} source={{ uri: imageUrl }} />
			)}
			<TouchableOpacity onPress={() => router.replace('/host')}>
				<Text style={styles.button}>Host</Text>
			</TouchableOpacity>
		
			<TextInput
				style={styles.input}
				placeholder="Enter Server Code"
				value={serverCode}
				onChangeText={setServerCode}
			/>
			<TouchableOpacity onPress={() => joinServer()}>
				<Text style={styles.button}>Join</Text>
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