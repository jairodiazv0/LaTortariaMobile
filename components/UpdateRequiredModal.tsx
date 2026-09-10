import { Modal, View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';

export function UpdateRequiredModal({ visible, storeUrl }: { visible: boolean; storeUrl: string | null }) {
    return (
        <Modal visible={visible} animationType="fade" transparent={false}>
            <View style={styles.container}>
                <Text style={styles.title}>Actualización requerida</Text>
                <Text style={styles.body}>
                    Hay una nueva versión de LaTortaria disponible. Debes actualizar para continuar usando la app.
                </Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => storeUrl && Linking.openURL(storeUrl)}
                >
                    <Text style={styles.buttonText}>Actualizar ahora</Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FAF7F2' },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
    body: { fontSize: 15, textAlign: 'center', marginBottom: 24, color: '#444' },
    button: { backgroundColor: '#C0392B', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 8 },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});
