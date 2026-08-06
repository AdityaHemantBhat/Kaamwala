import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../api/client';
import { socketService } from '../../api/socket';
import { useT } from '../../utils/i18n';
import { env } from '../../config/env';
import { getCachedLocation, cacheLocation } from '../../utils/locationCache';

// Interactive map shell mounted once; markers move in place via injected
// window.updateMarkers / window.setDestination. OSRM route is throttled.
function buildMapHtml(): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>
*{margin:0;padding:0}body{background:#f5f0e8}
#map{width:100vw;height:100vh}
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
        var min = Math.round(r.duration/60);
        lastRouteDrawn = true;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'route_info',min:min}));
        }
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

export default function LiveTracking() {
  const t = useT();
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [loading, setLoading] = useState(true);
  const [workerName, setWorkerName] = useState('');
  const [eta, setEta] = useState<number | null>(null);
  const [workerLoc, setWorkerLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [customerLoc, setCustomerLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [arrived, setArrived] = useState(false);
  const [arrivalOtp, setArrivalOtp] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const mapLoadedRef = useRef(false);
  const latestRef = useRef<{ lat: number; lng: number } | null>(null);
  const destRef = useRef<{ lat: number; lng: number } | null>(null);

  const inject = useCallback((js: string) => {
    if (!mapLoadedRef.current) return;
    try {
      webViewRef.current?.injectJavaScript(js);
    } catch {}
  }, []);

  const moveWorker = useCallback((lat: number, lng: number) => {
    latestRef.current = { lat, lng };
    setWorkerLoc({ latitude: lat, longitude: lng });
    inject(`window.updateMarkers && window.updateMarkers(${lat}, ${lng}); true;`);
    setShowMap(true);
  }, [inject]);

  const placeDestination = useCallback((lat: number, lng: number) => {
    destRef.current = { lat, lng };
    setCustomerLoc({ latitude: lat, longitude: lng });
    inject(`window.setDestination && window.setDestination(${lat}, ${lng}); true;`);
    setShowMap(true);
  }, [inject]);

  const syncMap = useCallback(() => {
    if (!mapLoadedRef.current) return;
    if (destRef.current) inject(`window.setDestination && window.setDestination(${destRef.current.lat}, ${destRef.current.lng}); true;`);
    if (latestRef.current) inject(`window.updateMarkers && window.updateMarkers(${latestRef.current.lat}, ${latestRef.current.lng}); true;`);
  }, [inject]);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    loadTracking();

    socketService.connect();
    socketService.joinBookingChat(bookingId);
    
    // Socket listeners for real-time updates
    socketService.on('worker_location_updated', (data: any) => {
      if (cancelled) return;
      if (data.lat !== undefined && data.lng !== undefined && (Math.abs(data.lat) > 1 || Math.abs(data.lng) > 1)) {
        moveWorker(data.lat, data.lng);
      }
      if (data.eta !== undefined) setEta(data.eta);
    });
    
    socketService.on('worker_stopped_sharing', () => {
      if (cancelled) return;
      setWorkerLoc(null);
      latestRef.current = null;
      setEta(null);
    });
    
    socketService.on('worker_arrived', () => {
      if (cancelled) return;
      setArrived(true);
      setEta(0);
    });

    // Polling fallback: re-fetch tracking data every 5 seconds to catch updates
    // if Socket.IO delivery fails. This prevents the race condition where
    // the OTP never appears because socket messages are lost.
    pollInterval = setInterval(() => {
      if (!cancelled) {
        loadTracking().catch(() => {});
      }
    }, 5000);

    return () => {
      cancelled = true;
      socketService.off('worker_location_updated');
      socketService.off('worker_stopped_sharing');
      socketService.off('worker_arrived');
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [bookingId, moveWorker, placeDestination]);

  async function loadTracking() {
    try {
      // Check cache first - if valid, show cached location immediately while fetching fresh data
      const cached = getCachedLocation(bookingId);
      if (cached && (Math.abs(cached.lat) > 1 || Math.abs(cached.lng) > 1)) {
        moveWorker(cached.lat, cached.lng);
      }

      // Fetch fresh data in background
      const res = await apiClient.get(`/tracking/${bookingId}`);
      const d = res.data?.data;
      
      if (!d) {
        console.warn('[LiveTracking] No tracking data returned');
        return;
      }

      // Update basic info
      setWorkerName(d.workerName || 'Worker');
      setEta(d.workerEta ?? null);
      
      // Critical: Update arrivalOtp - this triggers QR display.
      // If OTP just appeared, show it immediately even if location hasn't loaded yet.
      if (d.arrivalOtp && !arrivalOtp) {
        setArrivalOtp(d.arrivalOtp);
      } else if (d.arrivalOtp) {
        setArrivalOtp(d.arrivalOtp);
      }
      
      // Cache and display updated location if available
      if (typeof d.workerLat === 'number' && typeof d.workerLng === 'number' && (Math.abs(d.workerLat) > 1 || Math.abs(d.workerLng) > 1)) {
        cacheLocation(bookingId, d.workerLat, d.workerLng);
        moveWorker(d.workerLat, d.workerLng);
      }
      
      // Place customer destination
      if (typeof d.customerLat === 'number' && typeof d.customerLng === 'number') {
        placeDestination(d.customerLat, d.customerLng);
      }
    } catch (e) {
      console.error('[LiveTracking] Error loading tracking data:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#FF5C00" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Live Tracking')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Map */}
      {showMap ? (
        <View style={styles.map}>
          <WebView
            ref={webViewRef}
            originWhitelist={['https://*']}
            source={{ html: buildMapHtml(), baseUrl: 'https://geo.example.com' }}
            onLoadEnd={() => { mapLoadedRef.current = true; syncMap(); }}
            style={{ flex: 1 }}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled={true}
            mixedContentMode="never"
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'route_info' && data.min !== undefined) {
                  setEta(Number(data.min));
                }
              } catch (e) {}
            }}
          />
        </View>
      ) : (
        <View style={styles.mapPlaceholder}>
          <MaterialCommunityIcons name="map-marker-question" size={48} color="#CCC" />
          <Text style={styles.waitText}>{t('Loading map...')}</Text>
        </View>
      )}

      {/* ETA Card */}
      <View style={styles.etaCard}>
        {arrived ? (
          <>
            <View style={styles.arrivedIcon}>
              <MaterialCommunityIcons name="check-circle" size={36} color="#1A5C2A" />
            </View>
            <Text style={styles.arrivedTitle}>{t('Worker has arrived!')}</Text>
            <Text style={styles.arrivedSub}>{t('Your service is starting now')}</Text>
          </>
        ) : (
          <>
            <View style={styles.etaRow}>
              <View style={styles.etaDot} />
              <Text style={styles.etaLabel}>{workerName} {t('is on the way')}</Text>
            </View>
            {eta !== null ? (
              <Text style={styles.etaValue}>{eta < 1 ? t('Arriving now') : `${eta} ${t('min')}`}</Text>
            ) : (
              <Text style={[styles.etaValue, { fontSize: 18, color: '#999' }]}>{t('Waiting for location...')}</Text>
            )}
            {arrivalOtp && (
              <View style={{ marginTop: 16, padding: 16, backgroundColor: '#FFF0E8', borderRadius: 12, alignItems: 'center', width: '100%' }}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: '#FF5C00' }}>{t('Show QR to worker on arrival')}</Text>
                <View style={{ marginTop: 12, padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
                  <QRCode value={arrivalOtp} size={140} color="#0D0D0D" backgroundColor="#FFFFFF" />
                </View>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#666', marginTop: 8 }}>{t('Worker will scan this to start the job')}</Text>
              </View>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D' },
  map: { flex: 1, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden' },
  etaCard: { margin: 24, backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 3, padding: 24, alignItems: 'center' },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  etaDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5C00' },
  etaLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#666' },
  etaValue: { fontSize: 28, fontFamily: 'SpaceMono_700Bold', color: '#FF5C00' },
  arrivedIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(26,92,42,0.08)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  arrivedTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#1A5C2A' },
  arrivedSub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#666', marginTop: 4 },
  mapPlaceholder: { flex: 1, marginHorizontal: 12, borderRadius: 16, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', elevation: 1 },
  waitText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#999', marginTop: 12 },
});