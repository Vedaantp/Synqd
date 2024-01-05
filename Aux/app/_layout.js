import { Stack } from "expo-router/stack";
import { Button, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";


export default () => {
    const theme = useColorScheme();

    return (
        <SafeAreaProvider>
            <Stack
                screenOptions={{
                    headerShown: false,
                    animation: 'fade'
                }}
            >

                <Stack.Screen
                    name="joinModal"
                    options={{
                        presentation: 'modal',
                        animation: 'default',
                        headerShown: true,
                        title: null,
                        headerStyle: {
                            backgroundColor: theme === 'light' ? 'white' : 'black',
                        },
                        headerLeft: () => <Button onPress={() => router.push('/')} title="Cancel" />
                    }}
                />

                <Stack.Screen
                    name="queueModal"
                    options={{
                        presentation: 'modal',
                        animation: 'default',
                        headerShown: true,
                        title: "Queue",
                        headerStyle: {
                            backgroundColor: theme === 'light' ? 'white' : 'black',
                        },
                        headerLeft: () => <Button onPress={() => router.push('/host')} title="Back" />
                    }}
                />

                <Stack.Screen
                    name="sessionInfoCard"
                    options={{
                        presentation: 'card',
                        animation: 'default',
                        headerShown: true,
                        title: "Session Info",
                        headerStyle: {
                            backgroundColor: theme === 'light' ? 'white' : 'black',
                        },
                        headerLeft: () => <Button onPress={() => router.push('/host')} title="Back" />
                    }}
                />

            </Stack>

        </SafeAreaProvider>
    );
};