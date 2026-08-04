import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { socketService } from '../../api/socket';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';
import { useToast } from '../../components/ui/ToastProvider';
import { SOSButton } from '../../components/ui/SOSButton';
import { env } from '../../config/env';
import { startWorkerLocationSharing, stopWorkerLocationSharing } from '../../utils/locationTask';

// Interactive map shell. Markers are created/moved in place by the injected
// window.updateMarkers / window.setDestination calls, so the WebView is mounted
// once instead of being torn down and reloaded on every GPS fix (no flicker,
// no tile re-fetching). OSRM route is throttled to bound network usage.
function buildMapHtml(): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>
*{margin:0;padding:0}body{background:#f5f0e8}
#map{width:100vw;height:100vh}
.leaflet-tooltip.route-tooltip {
  background-color: #0D0D0D;
  color: #FFF;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font: 600 13px sans-serif;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
.leaflet-tooltip-top.route-tooltip::before {
  border-top-color: #0D0D0D;
}
</style>
</head><body>
<div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
var map = L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=${env.GEOAPIFY_KEY}',{maxZoom:19,attribution:'Geoapify'}).addTo(map);
map.setView([20.5937,78.9629],5);

var destMarker = null;
var workerMarker = null;
var routeLayer = null;
var lastRouteLat = null;
var lastRouteLng = null;
var lastRouteDrawn = false;

function dotIcon(color, size) {
  return L.divIcon({html:'<div style="width:'+size+'px;height:'+size+'px;background:'+color+';border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',className:'',iconSize:[12,12],iconAnchor:[6,6]});
}
var destIcon = dotIcon('#FF5C00', 16);
var workerIcon = dotIcon('#0D0D0D', 14);

function drawRoute() {
  if (!workerMarker || !destMarker) return;
  var w = workerMarker.getLatLng();
  // Bound OSRM traffic: only re-route after ~150m of movement, or when a route
  // has never been drawn yet.
  if (lastRouteDrawn && lastRouteLat !== null && lastRouteLng !== null) {
    var dLat = w.lat - lastRouteLat, dLng = w.lng - lastRouteLng;
    var kmMoved = Math.sqrt(dLat*dLat + dLng*dLng) * 111;
    if (kmMoved < 0.15) return;
  }
  lastRouteLat = w.lat; lastRouteLng = w.lng;
  var d = destMarker.getLatLng();
  fetch('https://router.project-osrm.org/route/v1/driving/'
    + w.lng+','+w.lat+';'+d.lng+','+d.lat+'?geometries=geojson&overview=full')
    .then(function(r){return r.json()})
    .then(function(data){
      if (data.code==='Ok' && data.routes && data.routes[0]) {
        var r = data.routes[0];
        var coords = r.geometry.coordinates.map(function(c){return [c[1],c[0]]});
        if (routeLayer) routeLayer.remove();
        routeLayer = L.polyline(coords,{color:'#FF5C00',weight:4,opacity:.8}).addTo(map);
        var km = (r.distance/1000).toFixed(1);
        var min = Math.round(r.duration/60);
        if (workerMarker) {
          workerMarker.bindTooltip(km+' km ~ '+min+' min', {
            permanent: true, direction: 'top', className: 'route-tooltip', offset: [3, -10]
          }).openTooltip();
        }
        lastRouteDrawn = true;
      }
    }).catch(function(){});
}

window.setDestination = function(dlat, dlng) {
  if (dlat == null || dlng == null) return;
  if (destMarker) { destMarker.setLatLng([dlat,dlng]); }
  else { destMarker = L.marker([dlat,dlng],{icon:destIcon}).addTo(map); }
  drawRoute();
  if (!workerMarker) map.setView([dlat,dlng],15);
};
window.updateMarkers = function(wlat, wlng) {
  if (wlat == null || wlng == null) return;
  if (workerMarker) { workerMarker.setLatLng([wlat,wlng]); }
  else { workerMarker = L.marker([wlat,wlng],{icon:workerIcon}).addTo(map); }
  map.setView([wlat,wlng], Math.max(map.getZoom(),15));
  drawRoute();
};
</script></body></html>`;
}

export default function WorkerLiveTracking() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const t = useT();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [workerLoc, setWorkerLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [booking, setBooking] = useState<any>(null);
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const mapLoadedRef = useRef(false);
  const latestRef = useRef<{ lat: number; lng: number } | null>(null);
  const destRef = useRef<{ lat: number; lng: number } | null>(null);
  const watcherRef = useRef<any>(null);

  const inject = useCallback((js: string) => {
    if (!mapLoadedRef.current) return;
    try {
      webViewRef.current?.injectJavaScript(js);
    } catch { /* WebView not ready — a later onLoadEnd re-syncs it. */ }
  }, []);

  const moveWorker = useCallback((lat: number, lng: number) => {
    latestRef.current = { lat, lng };
    setWorkerLoc({ latitude: lat, longitude: lng });
    inject(`window.updateMarkers && window.updateMarkers(${lat}, ${lng}); true;`);
  }, [inject]);

  const placeDestination = useCallback((lat: number, lng: number) => {
    destRef.current = { lat, lng };
    inject(`window.setDestination && window.setDestination(${lat}, ${lng}); true;`);
  }, [inject]);

  // Re-apply the full map state whenever the WebView finishes loading.
  const syncMap = useCallback(() => {
    if (!mapLoadedRef.current) return;
    if (destRef.current) {
      inject(`window.setDestination && window.setDestination(${destRef.current.lat}, ${destRef.current.lng}); true;`);
    }
    if (latestRef.current) {
      inject(`window.updateMarkers && window.updateMarkers(${latestRef.current.lat}, ${latestRef.current.lng}); true;`);
    }
  }, [inject]);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;

    socketService.connect();
    socketService.joinBookingChat(bookingId);

    // The worker's own map mirrors the server echo (single source of truth),
    // exactly like the customer's map. Covers both the background task and the
    // foreground-watch fallback without duplicating location consumers.
    const onLocation = (data: any) => {
      const { lat, lng } = data || {};
      if (typeof lat === 'number' && typeof lng === 'number' && (Math.abs(lat) > 1 || Math.abs(lng) > 1)) {
        moveWorker(lat, lng);
      }
    };
    socketService.on('worker_location_updated', onLocation);

    if (bookingId) {
      apiClient.get('/bookings').then((res) => {
        if (cancelled) return;
        const b = res.data?.data?.find((x: any) => x.id === bookingId);
        if (b) {
          const { latitude, longitude } = b.address || {};
          if (typeof latitude === 'number' && typeof longitude === 'number') {
            placeDestination(latitude, longitude);
          }
          setBooking(b);
        }
      }).catch(() => {});
    }

    (async () => {
      try {
        const fg = await Location.requestForegroundPermissionsAsync();
        if (fg.status !== 'granted') {
          if (!cancelled) showToast({ message: t('Location permission required'), type: 'error' });
          return;
        }
        // iOS: allow background fixes so tracking continues while the app is
        // backgrounded (Android uses the foreground service from the plugin).
        await Location.requestBackgroundPermissionsAsync().catch(() => {});

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }).catch(() => null);
        if (cancelled) return;
        if (loc) moveWorker(loc.coords.latitude, loc.coords.longitude);
        setShowMap(true);

        // Prefer the shared background task (foreground + background). If the
        // runtime can't run tasks (e.g. Expo Go on Android), fall back to a
        // foreground-only watchPositionAsync stream.
        const bgStarted = await startWorkerLocationSharing(bookingId);
        if (!bgStarted && !cancelled) {
          watcherRef.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 1 },
            (n) => {
              const { latitude, longitude } = n.coords;
              if (Math.abs(latitude) > 1 || Math.abs(longitude) > 1) {
                moveWorker(latitude, longitude);
                socketService.emitLocationUpdate(bookingId, latitude, longitude);
              }
            },
          );
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
      socketService.off('worker_location_updated', onLocation);
      if (watcherRef.current) watcherRef.current.remove();
      stopWorkerLocationSharing();
      socketService.emit('worker:stop_sharing', { bookingId });
    };
  }, [bookingId, moveWorker, placeDestination]);

  const stopSharing = () => {
    stopWorkerLocationSharing();
    if (watcherRef.current) watcherRef.current.remove();
    socketService.emit('worker:stop_sharing', { bookingId });
    router.back();
  };

  const openNavigation = () => {
    if (!booking?.address) return;
    const { latitude, longitude } = booking.address;
    const url = Platform.select({
      ios: `maps://app?daddr=${latitude},${longitude}`,
      android: `google.navigation:q=${latitude},${longitude}`,
    });
    if (url) Linking.openURL(url);
  };

  const callCustomer = async () => {
    if (customerPhone) { Linking.openURL(`tel:${customerPhone}`); return; }
    try {
      const res = await apiClient.get(`/bookings/${bookingId}/contact`);
      setCustomerPhone(res.data?.data?.phone);
      Linking.openURL(`tel:${res.data?.data?.phone}`);
    } catch {
      showToast({ message: t('Could not fetch contact'), type: 'error' });
    }
  };

  const destLabel = booking?.address
    ? [booking.address.line1, booking.address.landmark, booking.address.city, booking.address.state].filter(Boolean).join(', ')
    : t('Destination address');

  return (
    <View style={styles.container}>
      {showMap && (
        <WebView
          ref={webViewRef}
          style={styles.map}
          source={{ html: buildMapHtml(), baseUrl: 'https://geo.example.com' }}
          onLoadEnd={() => { mapLoadedRef.current = true; syncMap(); }}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled={true}
          mixedContentMode="never"
          originWhitelist={['https://*']}
        />
      )}
      {!showMap && (
        <View style={styles.centerLoading}>
          <ActivityIndicator color="#FF5C00" size="large" />
        </View>
      )}

      <SafeAreaView style={styles.floatingHeader} edges={['top']}>
        <View style={styles.headerContent}>
          <Pressable onPress={stopSharing} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
          </Pressable>
          <View style={styles.statusPill}>
            <MaterialCommunityIcons name="map-marker" size={14} color="#4CAF50" style={{ marginRight: 6 }} />
            <Text style={styles.statusText}>{t('Live Tracking')}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <SOSButton bookingId={bookingId} />
        </View>
      </SafeAreaView>

      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
        <View style={styles.sheetHandle} />
        {booking ? (
          <>
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.sheetTitle}>{t('On the way to')} {booking.customer?.name}</Text>
            </View>
            <View style={styles.addressBox}>
              <MaterialCommunityIcons name="map-marker-radius" size={20} color="#FF5C00" />
              <Text style={styles.addressText} numberOfLines={2}>
                {destLabel}
              </Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable style={styles.navBtn} onPress={openNavigation}>
                <MaterialCommunityIcons name="navigation-variant" size={20} color="#FFF" />
                <Text style={styles.navBtnText}>{t('Navigate')}</Text>
              </Pressable>
              <Pressable style={styles.callBtn} onPress={callCustomer}>
                <MaterialCommunityIcons name="phone" size={20} color="#0D0D0D" />
              </Pressable>
            </View>
          </>
        ) : (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator color="#FF5C00" />
            <Text style={{ marginTop: 12, fontFamily: 'Inter_500Medium', color: '#6B6B6B' }}>{t('Loading booking details...')}</Text>
          </View>
        )}
        <Pressable style={styles.stopBtn} onPress={stopSharing}>
          <MaterialCommunityIcons name="stop-circle-outline" size={20} color="#F44336" />
          <Text style={styles.stopBtnText}>{t('Stop Sharing')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E8' },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  floatingHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  statusPill: { marginLeft: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  statusText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#0D0D0D' },
  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, elevation: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: -5 } },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D', marginBottom: 16 },
  addressBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF5F0', padding: 16, borderRadius: 16, marginBottom: 20 },
  addressText: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', color: '#4A2B1D', marginLeft: 12, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D0D0D', paddingVertical: 16, borderRadius: 16, gap: 8 },
  navBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  callBtn: { width: 56, height: 56, backgroundColor: '#F5F0E8', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 8 },
  stopBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#F44336' },
  centerLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F0E8' },
});
