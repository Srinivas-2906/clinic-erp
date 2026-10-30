import React from 'react';
import { View } from 'react-native';

/** Metro shim: avoid parsing RN private VirtualView (match syntax) in release bundle. */
export default function VirtualView({ children, ...rest }) {
  return <View {...rest}>{children}</View>;
}
