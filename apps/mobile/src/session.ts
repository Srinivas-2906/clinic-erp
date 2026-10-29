import * as SecureStore from 'expo-secure-store';

export const TENANT_KEY = 'clinic.tenant';
export const TOKEN_KEY = 'clinic.token';

export async function getStored(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setStored(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

export async function clearStored(key: string) {
  await SecureStore.deleteItemAsync(key);
}
