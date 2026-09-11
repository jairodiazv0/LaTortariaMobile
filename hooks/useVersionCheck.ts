import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const DISMISSED_VERSION_KEY = 'update_banner_dismissed_version';

function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

export function useVersionCheck() {
    const [updateRequired, setUpdateRequired] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [storeUrl, setStoreUrl] = useState<string | null>(null);

    useEffect(() => {
        const check = async () => {
            const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

            const { data, error } = await supabase
                .from('app_config')
                .select('min_version, latest_version, store_url_ios, store_url_android')
                .eq('id', 1)
                .single();

            if (error || !data) return;

            const url = Platform.OS === 'ios' ? data.store_url_ios : data.store_url_android;
            setStoreUrl(url);

            if (compareVersions(currentVersion, data.min_version) < 0) {
                setUpdateRequired(true);
                return;
            }

            if (data.latest_version && compareVersions(currentVersion, data.latest_version) < 0) {
                const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
                if (dismissed !== data.latest_version) {
                    setLatestVersion(data.latest_version);
                    setUpdateAvailable(true);
                }
            }
        };

        check();
    }, []);

    const dismissUpdateBanner = async () => {
        if (latestVersion) {
            await AsyncStorage.setItem(DISMISSED_VERSION_KEY, latestVersion);
        }
        setUpdateAvailable(false);
    };

    return { updateRequired, updateAvailable, storeUrl, dismissUpdateBanner };
}