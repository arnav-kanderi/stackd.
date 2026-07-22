import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Make sure stackd-app/.env is populated (see .env.example)."
  );
}

// Expo Router server-renders the web build on Node, where `window` doesn't
// exist. @react-native-async-storage/async-storage's web shim touches
// `window`/`localStorage` as soon as the auth client initializes (it calls
// storage.getItem immediately on construction to recover a session), which
// previously crashed the entire Node process on every route, not just one
// request. Server renders have no session to recover anyway, so swap in a
// no-op storage and skip session persistence/auto-refresh there.
const isServer = typeof window === 'undefined';

const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isServer ? noopStorage : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
    // Required for the LinkedIn OAuth flow (linkedin-connect-screen.tsx):
    // GoTrue defaults to the implicit flow, which never appends
    // code_challenge/code_challenge_method to the authorize URL. Without
    // this, exchangeCodeForSession has nothing valid to exchange even once
    // LinkedIn's provider is configured server-side (found during Section 3
    // security review).
    flowType: 'pkce',
  },
});
