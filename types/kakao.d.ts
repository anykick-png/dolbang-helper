declare global {
  interface Window {
    kakao?: KakaoGlobal;
  }

  interface KakaoGlobal {
    maps: KakaoMapsNamespace;
  }

  interface KakaoMapsNamespace {
    load(callback: () => void): void;
    Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    Marker: new (options: KakaoMarkerOptions) => KakaoMarker;
    Circle: new (options: KakaoCircleOptions) => KakaoCircle;
    event: {
      addListener(
        target: KakaoMarker,
        type: "click",
        handler: () => void,
      ): void;
    };
  }

  interface KakaoMapOptions {
    center: KakaoLatLng;
    level: number;
  }

  interface KakaoMap {
    setCenter(position: KakaoLatLng): void;
    panTo(position: KakaoLatLng): void;
  }

  interface KakaoLatLng {
    __brand?: "KakaoLatLng";
  }

  interface KakaoMarkerOptions {
    map?: KakaoMap | null;
    position: KakaoLatLng;
    title?: string;
  }

  interface KakaoMarker {
    setMap(map: KakaoMap | null): void;
  }

  interface KakaoCircleOptions {
    center: KakaoLatLng;
    radius: number;
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: "solid" | "shortdash" | "shortdot" | "dash" | "dot";
    fillColor?: string;
    fillOpacity?: number;
  }

  interface KakaoCircle {
    setMap(map: KakaoMap | null): void;
  }
}

export {};
