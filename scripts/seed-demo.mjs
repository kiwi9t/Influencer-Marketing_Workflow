import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
const db = new PrismaClient({adapter:new PrismaBetterSqlite3({url:process.env.DATABASE_URL ?? "file:./prisma/pipeline.db"})});
const stages=["PITCHING","NEGOTIATION","LOGISTICS_CONTRACT","DRAFT_REVIEW","LIVE_PENDING","COMPLETED"];
const names=["Olivia Park","Ethan Brooks","Sofia Rivera","Noah Kim","Chloe Bennett","Liam Chen","Isabella Reed","Lucas Morgan","Amelia Davis","Leo Zhang","Grace Wilson","Aria Patel"];
const titles=["Morning ritual","Desk reset","Weekend essentials","Coffee, reimagined","A better commute","Sunday slow-down","City guide","Workday recharge","Cozy season","Travel light","Studio stories","Daily favorites"];
const today=new Date();
try {
 for(let i=0;i<names.length;i++){
  const index=i%6, id="demo-collaboration-"+i, target=new Date(Date.UTC(today.getFullYear(),today.getMonth(),3+i*2));
  const published=index===5 ? new Date(Math.min(target.valueOf(),Date.now()-8*86400000)) : null;
  const history=stages.slice(0,index+1).map((to,j)=>({from:j ? stages[j-1] : null,to,at:new Date(target.valueOf()-(20-j*3)*86400000).toISOString()}));
  await db.deal.upsert({where:{id},update:{},create:{
   id,title:titles[i],isDemo:true,status:stages[index],targetLiveDate:target,
   topicNotes:"One 30–45 second lifestyle video showcasing Daybreak coffee in an everyday routine.",
   scopeRequirements:"Show product packaging and preparation. Include the campaign CTA and disclosure.",
   askingRate:800+i*125,targetBudget:900+i*100,agreedRate:index>=2 ? 750+i*100 : null,
   contractSigned:index>=3,contractUrl:index>=2?"https://example.com/demo/contract":null,
   briefUrl:index>=2?"https://example.com/demo/brief":null,
   shippingAddress:index>=2?"Demo recipient, 123 Example Lane, Chicago, IL 60601":null,
   shippingTrackingNumber:index>=2?"DEMO-"+i:null,
   deliveredAt:index>=3?new Date(target.valueOf()-12*86400000):null,
   sampleStatus:index>=3?"PASSED":null,
   draftUrl:index>=3?"https://example.com/demo/draft-"+i:null,
   reviewStatus:index>=4?"APPROVED":index===3?"REVISION_REQUESTED":null,
   reviewNotes:index===3?"Please bring the product reveal into the first three seconds.":"",
   destinationUrl:index>=4?"https://example.com/daybreak":null,
   trackingLink:index>=4?"https://example.com/daybreak?utm_source=instagram&utm_medium=influencer&utm_campaign=demo":null,
   hashtags:"#DaybreakRoutine #ad",stageHistory:history,
   publishedAt:published,liveVideoUrl:published?"https://example.com/demo/live-"+i:null,
   creator:{create:{id:"demo-creator-"+i,name:names[i],handle:"@"+names[i].toLowerCase().replaceAll(" ",""),email:"demo"+i+"@example.com",platform:["Instagram","TikTok","YouTube"][i%3]}},
   deliverables:index>=3?{create:[{kind:"SAMPLE",status:"PASSED",notes:"Demo record · Packaging and sample inspected."},{kind:"DRAFT",status:index>=4?"APPROVED":"REVISION_REQUESTED",url:"https://example.com/demo/draft-"+i,notes:"Demo review record"}]}:undefined,
   metrics:published?{create:Array.from({length:7},(_,d)=>({dayNumber:d+1,views:1400+i*100-d*110,comments:40-d*3,clicks:90-d*8,orders:8-d,source:"DEMO"}))}:undefined,
  }});
 }
 console.log("12 demo collaborations are ready.");
} finally {await db.$disconnect();}
