import { z } from 'zod';
import { db, identity, ensureClinic, allRecords, visible, mayWrite, failure, AppError, checkOrigin } from '@/lib/server';
import {validateWorkflow} from '@/lib/workflows';
import {insertRecord,notification} from '@/lib/care-server';
import { districts } from '@/lib/model';
import {normalizePatient,guardians} from '@/lib/patients';
import {eligiblePatient} from '@/lib/family';
import {professionalProjection} from '@/lib/access';
const kinds = ['patient', 'appointment', 'team', 'room', 'plan', 'prescription', 'session', 'report', 'alert', 'school', 'visit', 'invoice', 'leave', 'material', 'course', 'feedback', 'message', 'communication', 'attendance', 'settings', 'assessment', 'preference','equipment','notebook','exerciseResult','document','subscription','referral','channel','survey','courseProgress','wellbeing','autonomousSession','equipmentReservation','trainingEnrollment','communicationTemplate','campaign','communicationRule'];
const payload = z.object({ id: z.string().min(1).max(120).regex(/^[\w-]+$/), kind: z.enum(kinds as [
        string,
        ...string[]
    ]), version: z.number().int().nonnegative(), data: z.record(z.any()) });
export async function GET(req: Request) { try {
    const a = await identity(req);
    await ensureClinic(a);
    const rows = await allRecords(a);
    return Response.json({ records: rows.filter(r => visible(r, a, rows)).map(r=>professionalProjection(r.kind==='careNotice'?{...r,data:{...r.data,isRead:(r.data.readBy||[]).includes(a.user.userId)}}:r,a)), role: a.role, owner: a.owner, therapist: a.therapist, name: a.user.displayName, email:a.user.email, practice:a.therapist==='test-pilot-therapist'?'test':'daily' }, { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return failure(e);
} }
export async function POST(req: Request) {
    try {
        checkOrigin(req);
        const a = await identity(req);
        await ensureClinic(a);
        if (Number(req.headers.get('content-length')) > 100000)
            throw new AppError('Registo demasiado grande.');
        const raw = await req.text();
        if (raw.length > 100000)
            throw new AppError('Registo demasiado grande.');
        const parsed = payload.safeParse(JSON.parse(raw));
        if (!parsed.success)
            throw new AppError('Dados inválidos.');
        const r = parsed.data;
        const rows = await allRecords(a);
        const prev = rows.find(x => x.id === r.id);
        if (prev && prev.kind !== r.kind)
            throw new AppError('Tipo de registo inválido.');
        if (!mayWrite(r.kind, a) || prev && !visible(prev, a, rows))
            throw new AppError('Sem permissão para esta alteração.', 403);
        if(r.kind==='attendance'){if(prev)throw new AppError('Movimentos de ponto são imutáveis. Registe uma justificação para correções.');const n=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());r.data.date=n.slice(0,10);r.data.time=n.slice(11,16);r.data.recordedAt=new Date().toISOString();}
        try { validateWorkflow(r,prev,rows,a); } catch(e:any) { throw new AppError(e.message,403); }
        const d = r.data;
        if(r.kind==='document'){ d.signedAt=new Date().toISOString();d.signedBy=a.user.userId;const bytes=new TextEncoder().encode(JSON.stringify({patientId:d.patientId,name:d.name,body:d.body,signer:d.signer,signature:d.signature,signedAt:d.signedAt,signedBy:d.signedBy}));d.digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join(''); }
        for (const v of Object.values(d))
            if (typeof v === 'string' && v.length > (r.kind==='document'?80000:20000))
                throw new AppError('Texto demasiado longo.');
        if (['patient', 'team', 'room', 'plan', 'report', 'school', 'invoice', 'material', 'course', 'feedback', 'communication', 'assessment'].includes(r.kind) && !String(d.name || '').trim())
            throw new AppError('Preencha o nome ou título.');
        if (r.kind === 'leave' && (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{4}-\d{2}-\d{2}$/.test(d.endDate) || d.endDate < d.date))
            throw new AppError('Datas de ausência inválidas.');
        if (r.kind === 'patient') {
            try{normalizePatient(r,prev,rows.filter(x=>visible(x,a,rows)),a.user.userId)}catch(e:any){throw new AppError(e.message)}
            if (d.age===''||d.age===undefined||d.age===null||!Number.isFinite(Number(d.age)) || Number(d.age) < 0 || Number(d.age) > 120)
                throw new AppError('Idade inválida.');
            if (!rows.some(x => x.kind === 'team' && x.id === d.therapist && !['Inativo','Arquivado'].includes(x.data.status)))
                throw new AppError('Selecione um terapeuta.');
            if (a.role !== 'director' && d.therapist !== a.therapist)
                throw new AppError('Só pode gerir os seus pacientes.', 403);
        }
        if (d.patientId) {
            const p = rows.find(x => x.kind === 'patient' && x.id === d.patientId);
            if (!p || !visible(p, a, rows))
                throw new AppError('Paciente indisponível.', 403);
        }
        if (['plan', 'report'].includes(r.kind) && a.role !== 'director' && ['Aprovado', 'Ativo', 'Alta'].includes(d.status))
            throw new AppError('A aprovação pertence à direção.', 403);
        if (['leave', 'visit'].includes(r.kind) && a.role !== 'director' && ['Aprovado', 'Pago'].includes(d.status))
            throw new AppError('A aprovação pertence à direção.', 403);
        if (['appointment', 'attendance', 'leave', 'visit'].includes(r.kind) && a.role !== 'director' && d.therapist !== a.therapist)
            throw new AppError('Só pode gerir os seus registos.', 403);
        if (r.kind === 'prescription') {
            if (!districts.includes(d.district))
                throw new AppError('Distrito inválido.');
            for (const k of ['frequency', 'duration', 'repetitions'])
                if (!Number.isFinite(Number(d[k])) || Number(d[k]) < 1 || Number(d[k]) > 100)
                    throw new AppError('Dose inválida. Use valores entre 1 e 100.');
            d.sync = 'Não ligado à app da criança';
            delete d.mechanics;
        }
        if (r.kind === 'session') {
            for (const k of ['correct', 'help', 'error'])
                if (!Number.isInteger(d[k]) || d[k] < 0)
                    throw new AppError('Contagem inválida.');
        }
        if (r.kind === 'invoice' && (!Number.isFinite(Number(d.amount)) || Number(d.amount) < 0))
            throw new AppError('Valor inválido.');
        if (r.kind === 'feedback' && (!Number.isFinite(Number(d.score)) || d.score < 0 || d.score > 10))
            throw new AppError('Pontuação entre 0 e 10.');
        let conflictSql = '', conflictArgs: any[] = [];
        if (r.kind === 'appointment') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))
                throw new AppError('Data ou hora inválida.');
            if (![30, 45, 60, 90].includes(Number(d.duration)))
                throw new AppError('Duração inválida.');
            if (!rows.some(x => x.kind === 'team' && x.id === d.therapist) || !d.patientId)
                throw new AppError('Escolha paciente e terapeuta.');
            if (d.context === 'Clínica' && !rows.some(x => x.kind === 'room' && x.id === d.room))
                throw new AppError('Escolha uma sala.');
            const start = Number(d.time.slice(0, 2)) * 60 + Number(d.time.slice(3));
            if (start + Number(d.duration) > 1440)
                throw new AppError('A sessão ultrapassa o final do dia.');
            if (!['Falta', 'Cancelada'].includes(d.status)) {
                conflictSql = ` AND NOT EXISTS (SELECT 1 FROM records WHERE clinic=? AND kind='appointment' AND id<>? AND json_extract(data,'$.date')=? AND json_extract(data,'$.status') NOT IN ('Falta','Cancelada') AND (json_extract(data,'$.therapist')=? OR json_extract(data,'$.patientId')=? OR (?<>'' AND json_extract(data,'$.room')=?)) AND (CAST(substr(json_extract(data,'$.time'),1,2) AS INTEGER)*60+CAST(substr(json_extract(data,'$.time'),4,2) AS INTEGER)) < ? AND (CAST(substr(json_extract(data,'$.time'),1,2) AS INTEGER)*60+CAST(substr(json_extract(data,'$.time'),4,2) AS INTEGER)+CAST(json_extract(data,'$.duration') AS INTEGER)) > ?)`;
                conflictArgs = [a.tenant, a.tenant + ':' + r.id, d.date, d.therapist, d.patientId, d.room || '', d.room || '', start + Number(d.duration), start];
            }
        }
        if(r.kind==='equipmentReservation'&&d.status!=='Cancelada'){
            const start=Number(d.time.slice(0,2))*60+Number(d.time.slice(3));
            conflictSql = ` AND NOT EXISTS (SELECT 1 FROM records WHERE clinic=? AND kind='equipmentReservation' AND id<>? AND json_extract(data,'$.date')=? AND json_extract(data,'$.equipmentId')=? AND json_extract(data,'$.status')<>'Cancelada' AND (CAST(substr(json_extract(data,'$.time'),1,2) AS INTEGER)*60+CAST(substr(json_extract(data,'$.time'),4,2) AS INTEGER)) < ? AND (CAST(substr(json_extract(data,'$.time'),1,2) AS INTEGER)*60+CAST(substr(json_extract(data,'$.time'),4,2) AS INTEGER)+CAST(json_extract(data,'$.duration') AS INTEGER)) > ?)`;
            conflictArgs=[a.tenant,a.tenant+':'+r.id,d.date,d.equipmentId,start+Number(d.duration),start];
        }
        if(r.kind==='attendance'){conflictSql=" AND (SELECT COUNT(*) FROM records WHERE clinic=? AND kind='attendance' AND json_extract(data,'$.therapist')=? AND json_extract(data,'$.date')=?)=?";conflictArgs=[a.tenant,d.therapist,d.date,rows.filter(x=>x.kind==='attendance'&&x.data.therapist===d.therapist&&x.data.date===d.date).length];}
        if(r.kind==='trainingEnrollment'){
            conflictSql = ` AND NOT EXISTS (SELECT 1 FROM records WHERE clinic=? AND kind='trainingEnrollment' AND id<>? AND json_extract(data,'$.courseId')=? AND json_extract(data,'$.therapist')=?)`;
            conflictArgs=[a.tenant,a.tenant+':'+r.id,d.courseId,d.therapist];
        }
        const now = new Date().toISOString(), id = a.tenant + ':' + r.id, mutationId=crypto.randomUUID(); d.mutationId=mutationId;
        let statement;
        if (prev) {
            statement = db().prepare('UPDATE records SET data=?,version=version+1,updated=? WHERE id=? AND clinic=? AND version=?' + conflictSql).bind(JSON.stringify(d), now, id, a.tenant, r.version, ...conflictArgs);
        }
        else {
            statement = db().prepare('INSERT INTO records (id,clinic,kind,data,author,version,updated) SELECT ?,?,?,?,?,1,? WHERE NOT EXISTS (SELECT 1 FROM records WHERE id=?)' + conflictSql).bind(id, a.tenant, r.kind, JSON.stringify(d), a.user.userId, now, id, ...conflictArgs);
        }
        const audit=db().prepare("INSERT INTO audit(id,clinic,actor,action,record_id,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)").bind(mutationId,a.tenant,a.user.userId,prev?'update':'create',id,now,id,mutationId);
        const extra=r.kind==='patient'&&prev&&prev.data.therapist!==d.therapist?[insertRecord(a,notification('handover-'+r.id+'-'+(prev.version+1),{name:'Acompanhamento atribuído',patientId:r.id,therapist:d.therapist,type:'handover',body:'Consulte os planos, sumários e preparação da próxima sessão. Atribuição alterada pela direção.',previousTherapist:prev.data.therapist}),{id:r.id,op:mutationId})]:[];
        if(r.kind==='patient'){const emails=guardians(d).filter(g=>eligiblePatient(r,g.email)).map(g=>g.email);extra.push(db().prepare("UPDATE family_access SET enabled=0 WHERE clinic=? AND patient_id=?"+(emails.length?" AND email NOT IN ("+emails.map(()=>'?').join(',')+")":'')+" AND EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)").bind(a.tenant,r.id,...emails,id,mutationId));}
        const result=await db().batch([statement,audit,...extra]);
        if(!result[0].meta.changes)throw new AppError(['appointment','equipmentReservation'].includes(r.kind)?'Conflito de horário ou registo atualizado por outra pessoa. Escolha outro horário ou atualize a página.':'Este registo foi atualizado. Atualize a página antes de guardar.',409);
        return Response.json({ record: { ...r, data: d, version: prev ? prev.version + 1 : 1, author: prev?.author || a.user.userId } });
    }
    catch (e) {
        return failure(e);
    }
}
