export const languages = ['es', 'en', 'fr', 'ar'] as const;
export type Language = typeof languages[number];
export const interests = ['history', 'architecture', 'food'] as const;
export type Interest = typeof interests[number];
export type Localized = Record<Language, string>;
export const local = (es:string,en:string,fr:string,ar:string): Localized => ({es,en,fr,ar});
export const pois = [
  {
    id:'murallas', name:'Murallas Reales', latitude:35.8885, longitude:-5.3210, interests:['history','architecture'],
    source:'https://www.ceuta.es/ceuta/museos-ceuta/murallas-reales',
    narration:local('Las Murallas Reales forman un conjunto fortificado junto al foso navegable de Ceuta. Observa cómo las defensas delimitan el acceso al centro de la ciudad.', 'The Royal Walls form a fortified complex beside Ceuta’s navigable moat. Look at how the defences frame the entrance to the city centre.', 'Les Murailles Royales forment un ensemble fortifié au bord du fossé navigable de Ceuta. Observez comment les défenses encadrent l’entrée du centre-ville.', 'تشكل الأسوار الملكية مجمعاً محصناً بجوار الخندق المائي في سبتة. تأمل كيف تحدد التحصينات مدخل وسط المدينة.'),
    detail:local('Fíjate en la relación entre el agua y la arquitectura defensiva.','Notice the relationship between the water and defensive architecture.','Observez la relation entre l’eau et l’architecture défensive.','لاحظ العلاقة بين الماء والعمارة الدفاعية.')
  },
  {
    id:'africa', name:'Plaza de África', latitude:35.8883, longitude:-5.3185, interests:['history'],
    source:'https://www.turismoceuta.com/es/centro',
    narration:local('La Plaza de África reúne parte del patrimonio monumental de Ceuta. En su entorno se encuentran la catedral y el santuario de Santa María de África.', 'Plaza de África brings together part of Ceuta’s monumental heritage. The cathedral and the sanctuary of Santa María de África stand nearby.', 'La place d’Afrique rassemble une partie du patrimoine monumental de Ceuta. La cathédrale et le sanctuaire Santa María de África se trouvent à proximité.', 'تجمع ساحة أفريقيا جانباً من التراث المعماري لسبتة. تقع بالقرب منها الكاتدرائية وكنيسة سانتا ماريا دي أفريقيا.'),
    detail:local('La plaza permite observar varios edificios históricos en un mismo espacio.','The square lets you observe several historic buildings in one place.','La place permet d’observer plusieurs bâtiments historiques au même endroit.','تتيح الساحة مشاهدة عدة مبانٍ تاريخية في مكان واحد.')
  },
  {
    id:'dragones', name:'Casa de los Dragones', latitude:35.8897, longitude:-5.3070, interests:['architecture','history'],
    source:'https://www.ceutaturismo.com/arquitectura-detalle.php?s=casa-dragones',
    narration:local('La Casa de los Dragones destaca por las figuras de dragones de su cubierta y por su arquitectura ecléctica. Está junto a la Plaza de los Reyes.', 'The House of the Dragons stands out for the dragon figures on its roof and its eclectic architecture. It is next to Plaza de los Reyes.', 'La Maison des Dragons se distingue par les dragons de sa toiture et son architecture éclectique. Elle se trouve près de la Plaza de los Reyes.', 'يتميز بيت التنانين بتماثيل التنانين فوق سطحه وبعمارته الانتقائية. يقع بجوار ساحة الملوك.'),
    detail:local('Observa la decoración de la fachada desde el espacio público.','Observe the façade decoration from the public space.','Observez le décor de la façade depuis l’espace public.','تأمل زخارف الواجهة من المكان العام.')
  }
];
export const routes = [{ id:'ceuta-centro', name:local('Ceuta histórica','Historic Ceuta','Ceuta historique','سبتة التاريخية'), stops:pois.map(p=>p.id), estimatedMinutes:45 }];
export function localizedPoi(p: typeof pois[number], language:Language, preferences: string[] = []) {
  return {...p, narration:p.narration[language] + (preferences.some(i=>p.interests.includes(i)) ? ' '+p.detail[language] : ''), detail:undefined};
}
export const emergencySteps = {
  es:['En una emergencia, llama al 112.','Indica tu ubicación y explica lo que ocurre al operador.','Sigue sus indicaciones. Para localizar un centro, abre la navegación.'],
  en:['In an emergency, call 112.','Tell the operator your location and what has happened.','Follow their instructions. To locate a centre, open navigation.'],
  fr:['En cas d’urgence, appelez le 112.','Indiquez votre position et expliquez la situation à l’opérateur.','Suivez ses instructions. Pour trouver un centre, ouvrez la navigation.'],
  ar:['في حالة الطوارئ اتصل بالرقم 112.','أخبر الموظف بموقعك واشرح ما حدث.','اتبع تعليماته. لتحديد موقع مركز افتح تطبيق الملاحة.']
};
export function directions(destination:string) {
  return 'https://www.google.com/maps/dir/?api=1&travelmode=walking&destination='+encodeURIComponent(destination);
}
export const emergencyServices = [
  {id:'hospital',kind:'hospital',name:'Hospital Universitario de Ceuta',address:'Calle Loma Colmenar s/n, Ceuta',source:'https://www.sanidad.gob.es/ciudadanos/centros.do?metodo=realizarDetalle&numero=510039&tipo=hospital',directionsUrl:directions('Hospital Universitario de Ceuta, Calle Loma Colmenar, Ceuta')},
  {id:'police',kind:'police',name:'Policía Nacional · Ceuta',address:'Paseo de Colón 4, Ceuta',source:'https://sede.policia.gob.es/portalCiudadano/_es/dependencias_localizador_accesible_provincias.php',directionsUrl:directions('Jefatura Superior de Policía de Ceuta, Paseo de Colón 4, Ceuta')},
  {id:'consular',kind:'consular',name:'Embajadas y consulados extranjeros en España',address:'Directorio por nacionalidad · no se presupone una oficina en Ceuta',source:'https://www.spain.info/es/consulta/embajadas-espana/',directionsUrl:null}
];
export function distanceMeters(a:number,b:number,c:number,d:number) {
  const rad = Math.PI/180;
  const h = Math.sin((c-a)*rad/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
