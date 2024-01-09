import { Stack } from "expo-router/stack";
import { Button, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import { MaterialIcons } from '@expo/vector-icons';

export default () => {
    const theme = useColorScheme();

    return (
        <SafeAreaProvider>
            <Stack
                screenOptions={{
                    headerShown: false,
                    animation: 'fade',
                }}
            >

                <Stack.Screen
                    name="joinModal"
                    options={{
                        presentation: 'modal',
                        animation: 'default',
                        headerShown: false,
                        title: null,
                        headerStyle: {
                            backgroundColor: theme === 'light' ? '#FFFFFF' : '#242424',
                        },
                    }}
                />

                <Stack.Screen
                    name="queueModal"
                    options={{
                        presentation: 'modal',
                        animation: 'default',
                        headerShown: false,
                    }}
                />

                <Stack.Screen
                    name="sessionInfoCard"
                    options={{
                        presentation: 'card',
                        animation: 'slide_from_left',
                        headerShown: false,
                    }}
                />

            </Stack>

        </SafeAreaProvider>
    );
};