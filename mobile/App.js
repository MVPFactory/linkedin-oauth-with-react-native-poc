import { StatusBar } from "expo-status-bar";
import { Linking, TextInput, Alert } from "react-native";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useEffect, useMemo, useState, useCallback } from "react";
import * as LinkingExpo from "expo-linking";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3000";

export default function App() {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState(null);
  const [postText, setPostText] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [posts, setPosts] = useState([]);

  const redirectUri = useMemo(() => {
    const url = LinkingExpo.createURL("/");
    return url.replace(/\/$/, "");
  }, []);

  const getQueryParam = (url, key) => {
    try {
      const u = new URL(url);
      return u.searchParams.get(key);
    } catch (e) {
      const q = url.split("?")[1] || "";
      const pairs = q.split("&");
      for (const p of pairs) {
        const [k, v] = p.split("=");
        if (decodeURIComponent(k || "") === key)
          return decodeURIComponent(v || "");
      }
      return null;
    }
  };

  const handleIncomingUrl = useCallback((url) => {
    if (!url) return;
    const err = getQueryParam(url, "error");
    if (err) {
      Alert.alert("Login error", String(err));
      return;
    }
    const t = getQueryParam(url, "token");
    if (t) setToken(String(t));
  }, []);

  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => {
      handleIncomingUrl(event.url);
    });
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) handleIncomingUrl(initialUrl);
    });
    return () => sub.remove();
  }, [handleIncomingUrl]);

  const openAuth = () => {
    const url = `${BACKEND_URL}/auth/linkedin?redirect_uri=${encodeURIComponent(
      redirectUri
    )}`;
    Linking.openURL(url);
  };

  const fetchSession = async () => {
    if (!token) return;
    try {
      const r = await fetch(`${BACKEND_URL}/api/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (data?.authenticated) setProfile(data.user || null);
      else setProfile(null);
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  useEffect(() => {
    if (token) fetchSession();
  }, [token]);

  const createPost = async () => {
    const text = postText.trim();
    if (!text) return;
    try {
      const r = await fetch(`${BACKEND_URL}/api/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (r.ok) {
        Alert.alert("Success", "Post created");
        setPostText("");
      } else {
        Alert.alert("Failed", data?.message || "Create post failed");
      }
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  const loadPosts = async () => {
    if (!token) return;
    try {
      const r = await fetch(`${BACKEND_URL}/api/posts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (r.ok) setPosts(Array.isArray(data?.elements) ? data.elements : []);
      else Alert.alert("Failed", data?.error?.message || "Load posts failed");
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>StoryMachine Mobile</Text>
      <Text style={styles.subtitle}>LinkedIn OAuth (mobile-first)</Text>

      {!token ? (
        <View style={styles.card}>
          <Pressable
            onPress={openAuth}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>Login with LinkedIn</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>Or paste token from browser</Text>
          <TextInput
            style={styles.input}
            placeholder="Paste token here"
            value={manualToken}
            onChangeText={setManualToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={() => {
              const t = manualToken.trim();
              if (t) setToken(t);
            }}
            style={({ pressed }) => [
              styles.linkButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.linkButtonText}>Use Token</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Authenticated</Text>
          <Text style={styles.token} numberOfLines={1}>
            Token: {token}
          </Text>
          <Pressable
            onPress={fetchSession}
            style={({ pressed }) => [
              styles.linkButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.linkButtonText}>Refresh Profile</Text>
          </Pressable>

          {profile && (
            <View style={styles.profileBox}>
              {profile.name && (
                <Text style={styles.profileLine}>{profile.name}</Text>
              )}
              {profile.email && (
                <Text style={styles.profileLine}>{profile.email}</Text>
              )}
            </View>
          )}

          <View style={styles.postBox}>
            <Text style={styles.sectionTitle}>Create Post</Text>
            <TextInput
              style={styles.input}
              placeholder="What's on your mind?"
              value={postText}
              onChangeText={setPostText}
              multiline
            />
            <Pressable
              onPress={createPost}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>Post</Text>
            </Pressable>
          </View>

          <View style={styles.postBox}>
            <Text style={styles.sectionTitle}>My Recent Posts</Text>
            <Pressable
              onPress={loadPosts}
              style={({ pressed }) => [
                styles.linkButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.linkButtonText}>Load Posts</Text>
            </Pressable>
            {posts.map((p, idx) => (
              <View key={p?.id || String(idx)} style={styles.item}>
                <Text style={styles.itemId} numberOfLines={1}>
                  {p?.id || "(no id)"}
                </Text>
                <Text style={styles.itemText}>
                  {p?.specificContent?.["com.linkedin.ugc.ShareContent"]
                    ?.shareCommentary?.text || "(no text)"}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Text style={styles.hint}>Backend: {BACKEND_URL}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
  },
  card: {
    width: "90%",
    maxWidth: 520,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 16,
    gap: 12,
  },
  button: {
    backgroundColor: "#0A66C2",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 220,
    alignItems: "center",
    marginBottom: 12,
  },
  linkButton: {
    backgroundColor: "#eee",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 220,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  linkButtonText: {
    color: "#333",
    fontWeight: "600",
  },
  token: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  profileBox: {
    gap: 4,
    marginBottom: 8,
  },
  profileLine: {
    color: "#333",
  },
  postBox: {
    gap: 8,
    marginTop: 8,
  },
  input: {
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    width: "100%",
  },
  item: {
    borderColor: "#eee",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    width: "100%",
  },
  itemId: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  itemText: {
    fontSize: 14,
    color: "#333",
  },
  hint: {
    marginTop: 24,
    color: "#999",
    fontSize: 12,
  },
});
