import { redirect } from 'next/navigation';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface CampaignShortLinkPageProps {
  params: Promise<{ shortCode: string }>;
}

export default async function CampaignShortLinkPage({ params }: CampaignShortLinkPageProps) {
  const { shortCode } = await params;
  redirect(`${API_BASE_URL}/c/${encodeURIComponent(shortCode)}`);
}
