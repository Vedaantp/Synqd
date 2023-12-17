import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Image, TextInput } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

export default function Page() {

	const [serverCode, setServerCode] = React.useState(null);

	const joinRoute = async () => {
		if (serverCode === null) {
		await AsyncStorage.setItem("serverCode", '');

		} else {
			await AsyncStorage.setItem("serverCode", serverCode);
		}

		router.replace('/join');
	}

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