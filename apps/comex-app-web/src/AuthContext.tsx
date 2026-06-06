import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  signOut,
  ConfirmationResult,
  signInWithPhoneNumber,
  RecaptchaVerifier
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';

interface Subscription {
  status: 'free' | 'premium';
  stripeStatus?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan?: 'monthly' | 'yearly';
  currentPeriodEnd?: any;
  cancelAtPeriodEnd?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isPremium: boolean;
  subscription: Subscription | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setupRecaptcha: (containerId: string) => void;
  signInWithPhone: (phoneNumber: string) => Promise<ConfirmationResult>;
  refreshSubscription: () => Promise<boolean>;
  isLoggingIn: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAILS = ['alvaropaconeto@gmail.com'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);

  const refreshSubscription = async (): Promise<boolean> => {
    if (!user) return false;
    const userRef = doc(db, 'users', user.uid);
    
    console.log("Starting subscription refresh polling...");

    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/subscription/sync-from-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
      });

      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.subscription?.status === 'premium') {
        setSubscription(data.subscription);
        setIsPremium(true);
        console.log('Subscription verified via sync-from-token!');
        return true;
      }
    } catch (err) {
      console.log('Subscription sync-from-token failed (non-fatal):', (err as any)?.message || err);
    }
    
    // Retry polling to wait for webhook - 10 attempts, 2 seconds each = 20 seconds total
    for (let i = 0; i < 10; i++) {
      try {
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data) {
            const sub = data.subscription || { status: 'free' };
            const userIsAdmin = data.role === 'admin' || (user.email && ADMIN_EMAILS.includes(user.email));
            const isSubPremium = sub.status === 'premium' || 
                               ['active', 'trialing', 'incomplete'].includes(sub.stripeStatus);
            const finalPremium = isSubPremium || userIsAdmin;
            
            console.log(`Refresh sync attempt ${i + 1}/10 - isPremium:`, finalPremium);
            
            if (finalPremium) {
              setSubscription(sub);
              setIsPremium(true);
              setIsAdmin(userIsAdmin);
              console.log("Subscription verified via refresh!");
              return true;
            }
          }
        }
        console.log(`Subscription refresh attempt ${i + 1}/10 - still waiting for webhook...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error refreshing subscription:", error);
        break;
      }
    }
    console.log("Subscription refresh: Polling finished.");
    return false;
  };

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    // Safety timeout: if auth doesn't resolve in 5 seconds, stop loading
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timeoutId);
      setUser(firebaseUser);
      console.log("Auth state changed:", firebaseUser?.uid);
      
      if (firebaseUser) {
        // Initial sync/check and real-time updates
        const syncUser = async () => {
          const userRef = doc(db, 'users', firebaseUser.uid);
          try {
            const userDoc = await getDoc(userRef);
            if (!userDoc.exists()) {
              const userData = {
                uid: firebaseUser.uid,
                displayName: firebaseUser.displayName || 'Anonymous Trader',
                email: firebaseUser.email || '',
                photoURL: firebaseUser.photoURL || '',
                role: 'trader',
                createdAt: serverTimestamp(),
                subscription: { status: 'free' }
              };
              await setDoc(userRef, userData, { merge: true });
            }
          } catch (error) {
            console.error("Error initial syncing user:", error);
          }

            try {
              const idToken = await firebaseUser.getIdToken();
              const resp = await fetch('/api/subscription/sync-from-token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`,
                },
              });
              const data = await resp.json().catch(() => null);
              if (resp.ok && data?.subscription?.status === 'premium') {
                setSubscription(data.subscription);
                setIsPremium(true);
                console.log('Subscription verified via initial sync-from-token!');
              }
            } catch (err) {
              console.log('Initial subscription sync-from-token failed (non-fatal):', (err as any)?.message || err);
            }

          // Listen for real-time updates (subscription changes)
          if (unsubscribeUserDoc) unsubscribeUserDoc();
          unsubscribeUserDoc = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
              const data = doc.data();
              if (data) {
                console.log("User data updated:", data.subscription);
                const userIsAdmin = data.role === 'admin' || (firebaseUser.email && ADMIN_EMAILS.includes(firebaseUser.email));
                setIsAdmin(userIsAdmin);
                const sub = data.subscription || { status: 'free' };
                setSubscription(sub);
                
                // Robust premium check: status is premium OR stripeStatus is active/trialing/incomplete OR user is admin
                const isSubPremium = sub.status === 'premium' || 
                                   ['active', 'trialing', 'incomplete'].includes(sub.stripeStatus);
                const finalPremium = isSubPremium || userIsAdmin;
                console.log("Setting isPremium to:", finalPremium, "Sub:", sub.status, "Stripe:", sub.stripeStatus, "Admin:", userIsAdmin);
                setIsPremium(finalPremium);
              }
            }
            setLoading(false); // Set loading false after first data fetch
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            setLoading(false);
          });
        };

        syncUser();
      } else {
        if (unsubscribeUserDoc) {
          unsubscribeUserDoc();
          unsubscribeUserDoc = null;
        }
        setIsAdmin(false);
        setIsPremium(false);
        setSubscription(null);
        setLoading(false); // Set loading false if no user
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  const setupRecaptcha = (containerId: string) => {
    if (recaptchaVerifier) return;
    const verifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
    });
    setRecaptchaVerifier(verifier);
  };

  const signInWithPhone = async (phoneNumber: string) => {
    if (!recaptchaVerifier) throw new Error('Recaptcha not initialized');
    return signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
  };

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const loginWithGoogle = async () => {
    if (isLoggingIn || user) return;
    setIsLoggingIn(true);
    console.log("Attempting Google login with authDomain:", auth.config.authDomain);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Google login error details:", {
        code: error.code,
        message: error.message,
        customData: error.customData
      });
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        console.log("Google login cancelled by user or multiple requests.");
      } else {
        console.error("Google login error:", error);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isAdmin, 
      isPremium,
      subscription,
      loginWithGoogle, 
      logout,
      setupRecaptcha,
      signInWithPhone,
      refreshSubscription,
      isLoggingIn
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
