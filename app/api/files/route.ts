import { identity, ensureClinic, allRecords, visible, db, bucket, checkOrigin, AppError, failure } from '@/lib/server';
export async function POST(req: Request) { try {
    checkOrigin(req);
    const a = await identity(req);
    await ensureClinic(a);
    if (Number(req.headers.get('content-length')) > 12 * 1024 * 1024)
        throw new AppError('Máximo: 10 MB por ficheiro.');
    const f = await req.formData();
    const file = f.get('file');
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024 || !file.size)
        throw new AppError('Escolha um ficheiro até 10 MB.');
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/ogg','audio/mpeg','audio/wav', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowed.includes(file.type.split(';')[0]))
        throw new AppError('Formato não suportado. Use PDF, Word, imagem, áudio ou texto.');
    const patientId = String(f.get('patientId') || '');
    const rows = await allRecords(a);
    if (patientId && !rows.some(r => r.kind === 'patient' && r.id === patientId && visible(r, a, rows)))
        throw new AppError('Paciente indisponível.', 403);
    const id = crypto.randomUUID(), key = a.tenant + '/' + id;
    const visibility = f.get('visibility') === 'Clínica' && (a.role === 'director' || patientId) ? 'Clínica' : 'Pessoal';
    const data = { name: file.name.slice(0, 150), size: file.size, type: file.type, visibility, patientId, key };
    await bucket().put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    try {
        await db().prepare('INSERT INTO records (id,clinic,kind,data,author,version,updated) VALUES (?,?,?,?,?,1,?)').bind(a.tenant + ':' + id, a.tenant, 'file', JSON.stringify(data), a.user.userId, new Date().toISOString()).run();
    }
    catch (e) {
        await bucket().delete(key);
        throw e;
    }
    return Response.json({ record: { id, kind: 'file', data, version: 1, author: a.user.userId } });
}
catch (e) {
    return failure(e);
} }
export async function GET(req: Request) { try {
    const a = await identity(req);
    const id = new URL(req.url).searchParams.get('id');
    const rows = await allRecords(a);
    const r = rows.find(r => r.id === id && r.kind === 'file');
    if (!r || !visible(r, a, rows))
        throw new AppError('Ficheiro indisponível.', 404);
    const file = await bucket().get(r.data.key);
    if (!file)
        throw new AppError('Ficheiro não encontrado.', 404);
    return new Response(file.body, { headers: { 'Content-Type': r.data.type || 'application/octet-stream', 'Content-Disposition': (new URL(req.url).searchParams.get('inline')==='1' && /^(audio|image)\//.test(r.data.type)?"inline":"attachment") + "; filename*=UTF-8''" + encodeURIComponent(r.data.name), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } });
}
catch (e) {
    return failure(e);
} }
