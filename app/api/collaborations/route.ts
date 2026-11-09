import { randomUUID } from "node:crypto";
import { db } from "../../../lib/db";
export async function POST(request: Request) {
  try {
    const form = await request.json();
    for (const key of ["title","name","handle","email","platform"]) {
      if (typeof form[key] !== "string" || !form[key].trim() || form[key].length > 254) return Response.json({error:"Complete all required fields."},{status:400});
    }
    if (!["Instagram","TikTok","YouTube"].includes(form.platform) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || !/^@?[a-zA-Z0-9_.-]{1,30}$/.test(form.handle)) return Response.json({error:"Check the email, handle and platform."},{status:400});
    const date = form.targetLiveDate ? new Date(form.targetLiveDate) : null;
    if (date && (Number.isNaN(date.valueOf()) || date.toISOString().slice(0,10) !== form.targetLiveDate)) return Response.json({error:"Enter a valid target date."},{status:400});
    const deal = await db.deal.create({data:{
      id:randomUUID(),title:form.title.trim(),targetLiveDate:date,
      stageHistory:[{from:null,to:"PITCHING",at:new Date().toISOString()}],
      creator:{create:{id:randomUUID(),name:form.name.trim(),handle:"@"+form.handle.replace(/^@/,""),email:form.email.trim(),platform:form.platform}},
    }});
    return Response.json({id:deal.id},{status:201});
  } catch { return Response.json({error:"Unable to create collaboration. Check the input and try again."},{status:400}); }
}
