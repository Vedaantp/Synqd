import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Image, TextInput, Alert } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import io from 'socket.io-client';

export default function Page() {


    /////////////////////////////////////////////////////////////////////////////////////////////////
	// variables

	const [serverCode, setServerCode] = React.useState(null);
	const [accountStatus, setAccountStatus] = React.useState(false);
	const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
	// on mount functions

	// runs functions once app is loaded onto this page
	React.useEffect(() => {

		// checks the users account status (premium or free spotify account)
		checkAccountStatus();
		// checks if the user is able to rejoin a server
		checkRejoin();

	}, []);
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
	// account type functions

	// function to check the users spotify account type and sets the value in use State
	const checkAccountStatus = async () => {
		const product = await getValue('accountStatus');

		if (product === 'premium') {
			setAccountStatus(true);
		} else {
			setAccountStatus(false);
		}

	};
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
	// other functions

	// function to retreive values from async storage
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
	// rejoin functions

	// function to check if user can rejoin a server
	const checkRejoin = async () => {

		const oldServerCode = await getValue("serverCode");

		// if the server code is set it will prompt the user to rejoin a session or not
		// on Yes the user will try to reconnect to the server
		// on No the user will be disconnected from the server
		if (oldServerCode) {
			Alert.alert(
				"Session Found",
				"Do you want to rejoin?",
				[
					{
						text: "No",
						style: "cancel",
						onPress: () => {
							stopRejoin();
						},
					},
					{
						text: "Yes",
						onPress: () => {
							rejoin();
						},
					},
				],
				{ cancelable: false }
			);
		}
	};

	// if user chose yes
	// user will be redirected to the correct page on the app and will try to reconnect to the server
	const rejoin = async () => {
		const oldServerCode = await getValue("serverCode");
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

	// if user chose No
	// the app will disconnect the user from the previous server
	const stopRejoin = async () => {
		const userId = await getValue("userId");
		const username = await getValue("username");
		const hosting = await getValue("hosting");
		const oldServerCode = await getValue("serverCode");

		await AsyncStorage.removeItem("serverCode");
		await AsyncStorage.setItem("hosting", 'false');
		await AsyncStorage.setItem("rejoining", "false");

		if (oldServerCode) {
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
					console.log('Rejoin canceled');
					socket.disconnect();
					resolve();
				});

				socket.on('userStoppedRejoin', (data) => {
					console.log("Rejoin canceled");
					socket.disconnect();
					resolve();
				});

				socket.on('joinError', (data) => {
					console.log("Rejoin canceled");
					socket.disconnect();
					resolve();
				});

				socket.on('rejoinError', (data) => {
					console.log("Rejoin canceled");
					socket.disconnect();
					resolve();
				});

				socket.on('serverFull', (data) => {
					console.log("Rejoin canceled");
					socket.disconnect();
					resolve();
				});

			});
		}
	};
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
	// join and host functions

	// function that handles user pressing join
	// sets the servercode and takes user to the join page
	const joinRoute = async () => {
		if (serverCode === null) {
			await AsyncStorage.setItem("serverCode", '');

		} else {
			await AsyncStorage.setItem("serverCode", serverCode);
		}

		router.replace('/join');
	};

	// if user is not a premium spotify member they will not be able to host a server
	const hostingDenied = async () => {
		Alert.alert(
			"Not Allowed To Host",
			"You can not host a server if you are not a Premium member of Spotify.",
			[
				{ text: 'OK' }
			],
			{ cancelable: false }
		);
	};
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
	// logout functions

	// allows user to logout and takes them back to log in page
	const logout = async () => {
		await AsyncStorage.setItem("accessToken", '');
		router.replace('/');
	};
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
	// screen

	// displays the Host button, Server Code text box, Join Button, and Logout button
	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.container}>
				{ accountStatus ? (
					<TouchableOpacity onPress={() => router.replace('/host')}>
						<Text style={styles.button}>Host</Text>
					</TouchableOpacity>
				) : (
					<TouchableOpacity onPress={() => hostingDenied()}>
						<Text style={styles.button}>Host</Text>
					</TouchableOpacity>
				)}			

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
		</SafeAreaView>
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