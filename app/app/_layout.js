import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CartProvider } from '../src/lib/cart';
import { NfcProvider } from '../src/components/NfcProvider';
import { colors } from '../src/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <CartProvider>
        <NfcProvider>
          <StatusBar style="light" backgroundColor={colors.primaryDark} />
          <Stack
            screenOptions={{
              // Every screen draws its own coloured header bar, so the router's
              // header stays off — otherwise each screen shows two stacked
              // headers (e.g. a plain "confirm" bar above "Review order").
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}
          />
        </NfcProvider>
      </CartProvider>
    </SafeAreaProvider>
  );
}
