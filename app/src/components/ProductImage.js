import { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, radius } from '../lib/theme';

// Shows a product photo when image_url is set and loads successfully.
// Falls back to the emoji, then to the first letter of the name.
export default function ProductImage({ product, size = 48, rounded = radius.sm }) {
  const [failed, setFailed] = useState(false);
  const hasImage = product.image_url && !failed;

  if (hasImage) {
    return (
      <Image
        source={{ uri: product.image_url }}
        style={[styles.img, { width: size, height: size, borderRadius: rounded }]}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }

  // Fallback
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: rounded }]}>
      <Text style={{ fontSize: size * 0.5 }}>
        {product.emoji || (product.name ? product.name.trim()[0].toUpperCase() : '🍃')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: colors.surfaceAlt },
  fallback: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
});
