import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

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
    const [storeUrl, setStoreUrl] = useState<string | null>(null);

    useEffect(() => {
        const check = async () => {
            const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

            const { data, error } = await supabase
                .from('app_config')
                .select('min_version, store_url_ios, store_url_android')
                .eq('id', 1)
                .single();

            if (error || !data) return;

            if (compareVersions(currentVersion, data.min_version) < 0) {
                setUpdateRequired(true);
                setStoreUrl(Platform.OS === 'ios' ? data.store_url_ios : data.store_url_android);
            }
        };

        check();
    }, []);

    return { updateRequired, storeUrl };
}