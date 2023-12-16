import * as React from 'react';
import { StyleSheet, Text, View } from "react-native";

export default function Page() {

	return (
		<View style={styles.container}>
			<Text>Host</Text>
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