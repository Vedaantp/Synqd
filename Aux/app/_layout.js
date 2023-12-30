import { Stack } from "expo-router/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default () => {
  return (
    <SafeAreaProvider>
      <Stack
      screenOptions={{
          headerShown: false,
      }}
      />
    </SafeAreaProvider>
  );
};