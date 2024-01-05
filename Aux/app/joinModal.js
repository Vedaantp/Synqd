import React from 'react';
import { Stack } from "expo-router/stack";
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, TouchableWithoutFeedback, TextInput, useWindowDimensions, Button, Alert, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { BarCodeScanner } from 'expo-barcode-scanner';

export default function Modal() {
    const theme = useColorScheme();
    const [scanned, setScanned] = React.useState(false);
    const [scanner, setScanner] = React.useState(false);
    const [hasPermission, setHasPermission] = React.useState(null);
    const [serverCode, setServerCode] = React.useState(null);
    const {height, width} = useWindowDimensions();

    /////////////////////////////////////////////////////////////////////////////////////////////////
    // QR Code Scanner

    const handleKeyboardDismiss = () => {
        Keyboard.dismiss();
    };
		
    const getBarCodeScannerPermissions = async () => {
        const { status } = await BarCodeScanner.requestPermissionsAsync();
        setHasPermission(status === 'granted');

        console.log(status);
    }

	const handleQRScan = async ({ data }) => {
		const code = parseInt(data, 10);
        const accessToken = await getValue("accessToken");

		setScanned(true);
        setScanner(false);

        console.log("QR Code Scanned");


        if (!accessToken) {
            let title = "Sign In";
            let message = "Please sign in to your spotify account before trying to Host or Join a session. Thank you.";
            await sendAlert(title, message);
            return;
        }

        if (await checkServerStatus()) {
            console.log("joining");

            if (code === null) {
                await AsyncStorage.setItem("serverCode", '');

            } else {
                await AsyncStorage.setItem("serverCode", data);
            }

        } else {
            let title = "Oops...";
            let message = "The servers are not currently online right now. Please give our team time to fix the issues. Thank you.";
            await sendAlert(title, message);
        }

	};

    const joinRoute = async () => {

        const accessToken = await getValue("accessToken");

        if (!accessToken) {
            let title = "Sign In";
            let message = "Please sign in to your spotify account before trying to Host or Join a session. Thank you.";
            await sendAlert(title, message);
            return;
        }

        if (await checkServerStatus()) {
            console.log("joining");

            if (serverCode === null) {
                await AsyncStorage.setItem("serverCode", '');

            } else {
                await AsyncStorage.setItem("serverCode", serverCode);
            }

        } else {
            let title = "Oops...";
            let message = "The servers are not currently online right now. Please give our team time to fix the issues. Thank you.";
            await sendAlert(title, message);
        }
	};

    // function to check the server status
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

    // if user is not a premium spotify member they will not be able to host a server
	const sendAlert = async (title, message) => {
		Alert.alert(
			`${title}`,
			`${message}`,
			[
				{ text: 'OK' }
			],
			{ cancelable: false }
		);
	};

    // function to retrieve values from async storage
    const getValue = async (key) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;

        } catch (error) {
            console.error("Get value error: ", error);
        }
    };

    const styles = StyleSheet.create({
		container: {
			flex: 1,
			alignItems: 'center',
			backgroundColor: theme === 'light' ? '#FFFFFF' : '#000000'
		},
        code: {
            flex: 1,
            justifyContent: 'center',
			alignItems: 'center',
        },
        input: {
			fontSize: 30,
			borderColor: theme === 'light' ? 'black' : 'white',
			borderRadius: 30,
			borderWidth: 2,
            paddingHorizontal: 20,
            paddingVertical: 10,
			color: theme === 'light' ? 'black' : 'white',
        },
        qr: {
            flex: 1,
            justifyContent: 'center',
			alignItems: 'center',
        },
        scanner: {
            flex: 1,
            zIndex: 2,
            position: 'absolute',
            width: width,
            height: height,
            backgroundColor: 'black',
        },
    });

  return (

    <TouchableWithoutFeedback style={styles.container} onPress={handleKeyboardDismiss}>
        <View style={styles.container} >
            <StatusBar style='light'/>
            <Stack.Screen
                options={{
                    headerLeft: () => <Button onPress={() => router.push('/')} title="Cancel"/>
                }}
            />

            { (scanner && hasPermission) && (
                
                <View style={styles.scanner}>
                    <Stack.Screen
                        options={{
                            headerLeft: () => <Button onPress={() => setScanner(false)} title="Back"/>
                        }}
                    />

                    <BarCodeScanner onBarCodeScanned={scanned ? undefined : handleQRScan} style={styles.scanner} />
                </View>
            )}

            <View style={styles.code}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter Code"
                    placeholderTextColor={theme === 'light' ? 'black' : 'white'}
                    value={serverCode}
                    onChangeText={setServerCode}
                    returnKeyType='join'
                    keyboardAppearance={theme}
                    keyboardType='numbers-and-punctuation'
                    maxLength={6}
                    onSubmitEditing={() => {
                        if (serverCode && (serverCode.toString()).length === 6) {
                            joinRoute()
                        }
                    }}
                    textAlign='center'
                />
            </View>

            <Text style={{ color: theme === 'light' ? 'black' : 'white', fontSize: 17, paddingHorizontal: '3%'}} >Or</Text>
                    
            <View style={styles.qr}>
                <TouchableOpacity style={{alignItems: 'center'}} onPress={ async () => {setScanned(false); setScanner(true); await getBarCodeScannerPermissions()}} >
                    <MaterialIcons name="qr-code-scanner" size={100} color={theme === 'light' ? 'black' : 'white'} />
                </TouchableOpacity>
            </View>
        </View>
    </TouchableWithoutFeedback>
        
  );
}
