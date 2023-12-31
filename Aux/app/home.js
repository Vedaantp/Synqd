import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Pressable, Image, TextInput, Alert, StatusBar, TouchableWithoutFeedback, Keyboard } from "react-native";
import { refreshAsync } from 'expo-auth-session';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import { router } from 'expo-router';
import io from 'socket.io-client';

export default function Page() {


    /////////////////////////////////////////////////////////////////////////////////////////////////
	// variables

	const [serverCode, setServerCode] = React.useState(null);
	const [accountStatus, setAccountStatus] = React.useState(false);
	const serverUrl = 'https://aux-server-88bcd769a4b4.herokuapp.com';
    const tokenEndpoint = 'https://accounts.spotify.com/api/token';
	const clientId = '43d48850732744018aff88a5692d03d5';
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
	// Api calls

	const validateAuth = async () => {
        const accessToken = await getValue("accessToken");
        const expiration = await getValue("expiration");
        let expirationTime = parseInt(expiration, 10);
        let currentTime = new Date().getTime();

        if (accessToken) {
            if (currentTime >= expirationTime) {
                // do refresh path
                await refreshAccessToken();
            }
        } else {

            console.log("Access token was invalid");

            // do login path
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

            console.error("Refresh error: ", error);
            // do login path
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

	const apiCall = async () => {

		await validateAuth();

        const accessToken = await getValue("accessToken");

        await fetch('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            }
        })
            .then((response) => response.json())
            .then((data) => {
				console.log("Data retreived");
                AsyncStorage.setItem("username", data.display_name);
                AsyncStorage.setItem("userId", data.id);
                AsyncStorage.setItem("accountStatus", data.product);
            })
            .catch((error) => {
                console.log("Fetch error: ", error);
				AsyncStorage.removeItem("accessToken");
				AsyncStorage.removeItem("username");
                AsyncStorage.removeItem("userId");
                AsyncStorage.removeItem("accountStatus");
				router.replace("/");
            })
    };
    /////////////////////////////////////////////////////////////////////////////////////////////////


    /////////////////////////////////////////////////////////////////////////////////////////////////
	// account type functions

	// function to check the users spotify account type and sets the value in use State
	async function checkAccountStatus() {

		await apiCall();

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

	// function that handles checking server if it is online
	const checkServerStatus = async () => {
		try {
			const response = await fetch('https://aux-server-88bcd769a4b4.herokuapp.com/serverStatus');
			
			if (response.status === 200) {
				return true;
			} else {
				return false;
			}
		} catch (error) {
			console.error("Server status error: ", error);
			return false;
		}
	};

	// function that handles user pressing join
	// sets the servercode and takes user to the join page
	const joinRoute = async () => {

		if (await checkServerStatus()) {


			if (serverCode === null) {
				await AsyncStorage.setItem("serverCode", '');

			} else {
				await AsyncStorage.setItem("serverCode", serverCode);
			}

			router.replace('/join');
		}
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
		<LinearGradient
			colors={['rgb(25, 20, 20)', 'rgb(25, 20, 20)']}
			start={{ x: 0, y: 0 }}
			end={{ x: 0, y: 1 }}
			style={styles.container}
		>
			<SafeAreaView style={styles.container}>
				<StatusBar barStyle='light-content' />
				<TouchableWithoutFeedback style={styles.container} onPress={() => {Keyboard.dismiss();}}>
					<View style={styles.container}>

						<View style={{ position: 'absolute', justifyContent: 'center', alignItems: 'center', top: '20%' }}>
							<Text style={{color: 'white', fontSize: 50}}>SHOW LOGO</Text>
						</View>

						<View style={styles.routeButtons}>
							{ accountStatus ? (
								<TouchableOpacity onPress={async () => {
									if (await checkServerStatus()) {
										router.replace('/host');
									}
								}}>
									<LinearGradient
										colors={['#7D00D1', '#61079d']}
										style={styles.hostButton}
										start={{ x: 0, y: 1 }}
										end={{ x: 1, y: 0 }}
									>
										<Text style={styles.host}>Host</Text>
									</LinearGradient>
								</TouchableOpacity>
							) : (
								<TouchableOpacity onPress={() => hostingDenied()}>
									<LinearGradient
										colors={['#7D00D1', '#61079d']}
										style={styles.hostButton}
										start={{ x: 0, y: 1 }}
										end={{ x: 1, y: 0 }}
									>
										<Text style={styles.host}>Host</Text>
									</LinearGradient>
								</TouchableOpacity>
							)}			

							<TextInput
								style={styles.input}
								placeholder="Join"
								placeholderTextColor='white'
								value={serverCode}
								onChangeText={setServerCode}
								returnKeyType='join'
								keyboardAppearance='dark'
								keyboardType='numbers-and-punctuation'
								maxLength={6}
								onSubmitEditing={() => {
									if (serverCode && (serverCode.toString()).length === 6){ 
										joinRoute()
									}
								}}
								textAlign='center'
							/>
						</View>

						<TouchableOpacity onPress={() => logout()}>
							<Text style={styles.logout}>Log Out</Text>
						</TouchableOpacity>
						
					</View>
				</TouchableWithoutFeedback>
			</SafeAreaView>
		</LinearGradient>
	);
    /////////////////////////////////////////////////////////////////////////////////////////////////
}


/////////////////////////////////////////////////////////////////////////////////////////////////
// styles

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'center',
		alignItems: "center",
	},
	routeButtons: {
		flex: 1,
		justifyContent: 'center',
		alignItems: "center",
		top: '5%'
	},
	hostButton: {
		color: "#7D00D1",
		marginBottom: 10,

		width: 150,
		height: 60,
		borderRadius: 25,
		paddingHorizontal: 15,
		justifyContent: 'center',
		alignItems: 'center'
	},
	host: {
		fontWeight: "bold",
		fontSize: 40,
		color: "white",
	},
	logout: {
		fontWeight: "bold",
		fontSize: 25,
		color: "#7D00D1",
		marginBottom: 50,

	},
	image: {
		width: 200,
		height: 200,
		marginVertical: 10,
	},
	input: {
		flex: 0,
		height: 50,
		width: 150,
		fontSize: 25,
		borderColor: '#7D00D1',
		borderRadius: 25,
		borderWidth: 1,
		marginVertical: 10,
		paddingHorizontal: 15,
		color: 'white',
	},
});  
/////////////////////////////////////////////////////////////////////////////////////////////////