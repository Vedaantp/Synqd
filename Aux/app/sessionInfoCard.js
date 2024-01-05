import React from 'react';
import { Stack } from "expo-router/stack";
import { View, Text, StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { BarCodeScanner } from 'expo-barcode-scanner';

import Divider from "./divider";

export default function Card() {
    const theme = useColorScheme();
    const [scanned, setScanned] = React.useState(false);
    const [scanner, setScanner] = React.useState(false);
    const [hasPermission, setHasPermission] = React.useState(null);
    const [serverCode, setServerCode] = React.useState(null);
    const {height, width} = useWindowDimensions();

    /////////////////////////////////////////////////////////////////////////////////////////////////

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

    <View>
        <Text>
            Hello
        </Text>
    </View>
        
  );
}
