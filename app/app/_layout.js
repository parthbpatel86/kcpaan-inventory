import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CartProvider } from '../src/lib/cart';
import { colors } from '../src/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <CartProvider>
        <StatusBar style="light" backgroundColor={colors.primaryDark} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="pos" options={{ headerShown: false }} />
          <Stack.Screen
            name="stock"
            options={{ title: 'Stock Management', headerShown: false }}
          />
        </Stack>
      </CartProvider>
    </SafeAreaProvider>
  );
}
