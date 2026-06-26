/* ===== بيانات أوّلية فارغة — النموذج الفعلي =====
   تُملأ من Firebase (المواد/الدروس/التمارين/الإشعارات/الطلاب). */

window.DB = {
  me: { id: '', sid: '', name: '', joined: '', quiz: {} },
  courses: [],
  lessons: [],
  exercises: {},
  notifications: [],
  students: [],
  today: new Date().toISOString().slice(0, 10),
};

window.avatarColor = function(name){
  const colors=['#6f4824','#3f6f54','#b8862f','#7d2c25','#4a2f17','#8a5a2e'];
  let s=0; for(const c of (name||'')) s+=c.charCodeAt(0);
  return colors[s%colors.length];
};
