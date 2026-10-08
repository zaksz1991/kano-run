export const STATE = { START: 0, PLAY: 1, OVER: 2, EVENT: 3 };

export const CONFIG = {
  LANES: 3,
  ROUTES: {
    panshekara: { id: 'panshekara', name: 'Panshekara Route', description: 'Busy southern corridor', difficulty: 1.15, landmarks: ['Panshekara Market', 'Kumbotso', 'Naibawa'], baseFare: 150 },
    sabongari: { id: 'sabongari', name: 'Sabon Gari Route', description: 'Commercial chaos', difficulty: 1.3, landmarks: ['Sabon Gari Market', 'Kantin Kwari', 'Wapa'], baseFare: 170 },
    citycenter: { id: 'citycenter', name: 'City Centre / Emir Palace', description: 'Historic core', difficulty: 1.2, landmarks: ["Emir's Palace", 'Kurmi Market', 'Dala Hill'], baseFare: 180 },
    zoo: { id: 'zoo', name: 'Zoo Road / Hotoro', description: 'Long busy artery', difficulty: 1.0, landmarks: ['Zoo Road Flyover', 'Hotoro', 'Naibawa'], baseFare: 140 },
    kumbotso: { id: 'kumbotso', name: 'Kumbotso Route', description: 'Industrial + residential', difficulty: 1.05, landmarks: ['Kumbotso', 'Sharada', 'Challawa'], baseFare: 140 },
    fajir: { id: 'fajir', name: 'Fagge / Kantin Kwari', description: 'Textile hub', difficulty: 1.25, landmarks: ['Fagge', 'Kantin Kwari', 'Wapa'], baseFare: 165 },
    nassarawa: { id: 'nassarawa', name: 'Nassarawa GRA / Airport', description: 'GRA corridor', difficulty: 0.95, landmarks: ['Nassarawa GRA', 'Airport Road', 'Farm Centre'], baseFare: 160 },
    kurmi: { id: 'kurmi', name: 'Kurmi Market Route', description: 'Ancient market chaos', difficulty: 1.35, landmarks: ['Kurmi Market', "Emir's Palace", 'Kofar Mata'], baseFare: 175 }
  },
  MISSIONS: [
    { text: 'Drop 8 passengers', type: 'drop', target: 8 },
    { text: 'Drive 3 km', type: 'dist', target: 3 },
    { text: 'Score ₦1500', type: 'score', target: 1500 },
    { text: 'Pick 12 passengers', type: 'pax', target: 12 }
  ]
};
