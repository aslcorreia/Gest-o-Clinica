import sqlite3,json,re,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
sql=(root/'drizzle/0000_cute_peter_quill.sql').read_text().replace('--> statement-breakpoint','')
c=sqlite3.connect(':memory:');c.executescript(sql)
src=(root/'app/api/data/route.ts').read_text();guard=re.search(r'conflictSql\s*=\s*`(.*?)`;' ,src,re.S).group(1)
def row(id,time,duration=45,therapist='t1',room='r1',patient='p1',status='Esperado'):
 return (id,'clinic','appointment',json.dumps(dict(date='2026-09-18',time=time,duration=duration,therapist=therapist,room=room,patientId=patient,status=status)),'owner',1,'2026-09-18')
c.execute('INSERT INTO records VALUES(?,?,?,?,?,?,?)',row('a','09:00'))
def available(start,duration=45,therapist='t1',room='r1',patient='p1',exclude='new'):
 args=['clinic',exclude,'2026-09-18',therapist,patient,room,room,start+duration,start]
 return bool(c.execute('SELECT 1 WHERE 1=1'+guard,args).fetchone())
assert not available(9*60+15)
assert available(9*60+45)
assert available(8*60+15)
assert not available(8*60+30)
assert not available(9*60,therapist='t2',room='r2') # patient conflict
assert not available(9*60,therapist='t2',patient='p2') # room conflict
assert not available(9*60,room='r2',patient='p2') # therapist conflict
assert available(9*60,therapist='t2',room='r2',patient='p2')
assert available(9*60,exclude='a') # editing same record
c.execute("UPDATE records SET data=json_set(data,'$.status','Cancelada')")
assert available(9*60)
print('10 scheduling overlap checks passed; migration applies cleanly')

reservation_guard=re.findall(r'conflictSql\s*=\s*`(.*?)`;',src,re.S)[1]
data=dict(date='2026-09-19',time='09:00',duration=45,equipmentId='eq',status='Reservada')
c.execute('INSERT INTO records VALUES(?,?,?,?,?,?,?)',('eq1','clinic','equipmentReservation',json.dumps(data),'owner',1,'2026-09-19'))
def equipment_available(start,equipment='eq',exclude='new'):
 return bool(c.execute('SELECT 1 WHERE 1=1'+reservation_guard,['clinic',exclude,'2026-09-19',equipment,start+45,start]).fetchone())
assert not equipment_available(555)
assert equipment_available(585)
assert equipment_available(540,'eq2')
assert equipment_available(540,exclude='eq1')
c.execute("UPDATE records SET data=json_set(data,'$.status','Cancelada') WHERE id='eq1'")
assert equipment_available(540)
print('5 atomic equipment reservation overlap checks passed')
