import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Image, TextInput, Alert } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import io from 'socket.io-client';

// check if user is a premium member 
// if not they cannot host so dim out the host button and display a message when they click on it

export default function Page() {

	const [serverCode, setServerCode] = React.useState(null);
	const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';

	React.useEffect(() => {

		checkRejoin();

	}, []);

	const getValue = async (key) => {
		try {
			const value = await AsyncStorage.getItem(key);
			return value;

		} catch (error) {
			console.error("Get value error: ", error);
		}
	};

	const checkRejoin = async (socket) => {

		const oldServerCode = await getValue("serverCode");

		if (oldServerCode) {
			Alert.alert(
				"Session Found",
				"Do you want to rejoin?",
				[
					{
						text: "No",
						style: "cancel",
						onPress: () => {
							stopRejoin(socket, oldServerCode);
						},
					},
					{
						text: "Yes",
						onPress: () => {
							rejoin(oldServerCode);
						},
					},
				],
				{ cancelable: false }
			);
		}
	};

	const rejoin = async (oldServerCode) => {
		const hosting = await getValue("hosting");

		if (oldServerCode) {
			await AsyncStorage.setItem("rejoining", "true");

			if (hosting === 'true') {
				router.replace('/host');
			} else {
				router.replace('/join');
			}

		} else {
			await AsyncStorage.setItem("rejoining", "false");
		}
	};

	const stopRejoin = async (socket, oldServerCode) => {
		const userId = await getValue("userId");
		const username = await getValue("username");
		const hosting = await getValue("hosting");

		await AsyncStorage.removeItem("serverCode");
		await AsyncStorage.setItem("hosting", 'false');
		await AsyncStorage.setItem("rejoining", "false");

		return new Promise ((resolve) => {
			const socket = io(serverUrl);

			socket.on('connect', () => {
				console.log('Connected to server');

				if (hosting === 'true') {
					socket.emit("updateHost", { username: username, userId: userId, serverCode: oldServerCode });
				} else {
					socket.emit('updateUser', { username: username, userId: userId, serverCode: oldServerCode });
				}
			});

			socket.on('updateUsers', (data) => {
				if (hosting === 'true') {
					socket.emit('end', {serverCode: oldServerCode, userId: userId});
					socket.emit('leaveServer', { serverCode: oldServerCode, userId: userId });
				} else {
					socket.emit('leaveServer', { serverCode: oldServerCode, userId: userId });
				}
			});

			socket.on('hostLeft', (data) => {
				console.log('Host disconnected');
				socket.disconnect();
				resolve();
			});

			socket.on('userLeft', (data) => {
				console.log("User disconnected");
				socket.disconnect();
				resolve();
			});

		});
	};

	const joinRoute = async () => {
		if (serverCode === null) {
			await AsyncStorage.setItem("serverCode", '');

		} else {
			await AsyncStorage.setItem("serverCode", serverCode);
		}

		router.replace('/join');
	};

	const logout = async () => {
		await AsyncStorage.setItem("accessToken", '');
		router.replace('/');
	};

	return (
		<View style={styles.container}>
			<TouchableOpacity onPress={() => router.replace('/host')}>
				<Text style={styles.button}>Host</Text>
			</TouchableOpacity>

			<TextInput
				style={styles.input}
				placeholder="Enter Server Code"
				value={serverCode}
				onChangeText={setServerCode}
				returnKeyType='go'
				onSubmitEditing={() => joinRoute()}
			/>
			<TouchableOpacity onPress={() => joinRoute()}>
				<Text style={styles.button}>Join</Text>
			</TouchableOpacity>

			<TouchableOpacity onPress={() => logout()}>
				<Text style={styles.button}>Logout</Text>
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