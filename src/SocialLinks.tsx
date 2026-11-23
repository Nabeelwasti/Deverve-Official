import type { ReactElement, SVGProps } from "react";

type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "linkedin" | "pinterest" | "threads" | "x";
const icons: Record<Platform, (props: SVGProps<SVGSVGElement>) => ReactElement> = {
 facebook: p => <svg viewBox="0 0 24 24" {...p}><path d="M13.5 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.2H7.6V13h2.7v8h3.2Z"/></svg>,
 instagram: p => <svg viewBox="0 0 24 24" {...p}><path d="M7.2 2.5h9.6a4.7 4.7 0 0 1 4.7 4.7v9.6a4.7 4.7 0 0 1-4.7 4.7H7.2a4.7 4.7 0 0 1-4.7-4.7V7.2a4.7 4.7 0 0 1 4.7-4.7Zm0 2A2.7 2.7 0 0 0 4.5 7.2v9.6a2.7 2.7 0 0 0 2.7 2.7h9.6a2.7 2.7 0 0 0 2.7-2.7V7.2a2.7 2.7 0 0 0-2.7-2.7H7.2Zm4.8 2.7a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Zm0 2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm5.1-3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/></svg>,
 tiktok: p => <svg viewBox="0 0 24 24" {...p}><path d="M19.6 7.1a6.2 6.2 0 0 1-4.1-1.5v8.1a5.7 5.7 0 1 1-5.7-5.7c.4 0 .8 0 1.2.1v3.2a2.6 2.6 0 1 0 1.4 2.3V2.5h3.1c.2 2.1 1.9 3.9 4.1 4.1v.5Z"/></svg>,
 youtube: p => <svg viewBox="0 0 24 24" {...p}><path d="M23 7.1a3 3 0 0 0-2.1-2.2C19 4.4 12 4.4 12 4.4s-7 0-8.9.5A3 3 0 0 0 1 7.1 31 31 0 0 0 .5 12c0 1.6.1 3.2.5 4.9a3 3 0 0 0 2.1 2.2c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.2c.4-1.7.5-3.3.5-4.9s-.1-3.2-.5-4.9ZM9.8 15.7V8.3l6.3 3.7-6.3 3.7Z"/></svg>,
 linkedin: p => <svg viewBox="0 0 24 24" {...p}><path d="M5.2 3a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM3.3 9h3.8v12H3.3V9Zm6.1 0H13v1.6h.1a4.1 4.1 0 0 1 3.7-2c4 0 4.7 2.6 4.7 5.9V21h-3.8v-5.8c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1V21H9.4V9Z"/></svg>,
 pinterest: p => <svg viewBox="0 0 24 24" {...p}><path d="M12 2a10 10 0 0 0-3.6 19.3c0-.8 0-1.8.2-2.7l1.3-5.5s-.3-.6-.3-1.5c0-1.4.8-2.4 1.8-2.4.8 0 1.2.6 1.2 1.4 0 .9-.6 2.3-.9 3.6-.3 1.1.5 2 1.6 2 1.9 0 3.3-2.5 3.3-5.5 0-2.3-1.6-4-4.4-4-3.2 0-5.2 2.4-5.2 5 0 .9.3 1.8.8 2.3.2.3.3.4.2.7l-.3 1c-.1.3-.3.4-.6.3-1.3-.5-1.9-2-1.9-3.7 0-2.8 2.4-6.2 7.3-6.2 3.9 0 6.5 2.8 6.5 5.9 0 4-2.2 7-5.4 7-1.1 0-2.2-.6-2.6-1.3l-.7 2.7c-.2 1-.8 1.9-1.2 2.7A10 10 0 1 0 12 2Z"/></svg>,
 threads: p => <svg viewBox="0 0 24 24" {...p}><path d="M12.1 2.2c-5.5 0-9 3.8-9 9.8 0 6.2 3.5 9.8 9.1 9.8 4.8 0 8-2.6 8-6.7 0-3.2-1.8-5.1-4.7-5.7-.3-2.2-1.5-3.3-3.6-3.3-1.8 0-3.2.9-4 2.5l2 1c.4-.9 1.1-1.4 2-1.4 1 0 1.5.4 1.7 1.2-4.7 0-7.3 1.9-7.3 5.2 0 2.7 2 4.6 4.8 4.6 2.6 0 4.5-1.5 4.8-4.2 1.1.5 1.6 1.4 1.6 2.7 0 2.7-2 4.4-5.3 4.4-4.2 0-6.8-2.8-6.8-7.5 0-4.7 2.5-7.5 6.8-7.5 2.4 0 4.1 1 5 2.8l2-1c-1.3-2.7-3.7-4.2-7.1-4.2Zm.1 13.9c-1.5 0-2.5-.8-2.5-2 0-1.8 1.6-2.8 4.8-2.8h.5c.1 3.1-1 4.8-2.8 4.8Z"/></svg>,
 x: p => <svg viewBox="0 0 24 24" {...p}><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.8 5.7 22H2.5l7.3-8.4L1.8 2h6.5l4.5 6.7L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z"/></svg>
};
export default function SocialLinks({links}:{links:Record<string,string>}) {
 const allowed=new Set<Platform>(["facebook","instagram","tiktok","youtube","linkedin","pinterest","threads","x"]);
 const entries=Object.entries(links).filter(([platform,url])=>allowed.has(platform as Platform)&&typeof url==="string"&&/^https:\/\//i.test(url));
 if(!entries.length)return null;
 return <nav className="footer-social-links" aria-label="De VERVE social accounts">{entries.map(([platform,url])=>{const Icon=icons[platform as Platform];return <a key={platform} href={url} target="_blank" rel="noopener noreferrer" aria-label={"Visit De VERVE on "+platform}><Icon/></a>;})}</nav>;
}
