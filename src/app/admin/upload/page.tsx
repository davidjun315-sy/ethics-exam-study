import { PdfUploader } from "@/components/admin/PdfUploader";
import { PageTitle } from "@/components/ui";

export const metadata = { title: "PDF 업로드" };

export default function UploadPage() {
  return (
    <div>
      <PageTitle title="PDF 업로드 / 시험 등록" subtitle="업로드 후 브라우저에서 페이지를 렌더링하고 문항을 자동으로 분리합니다." />
      <PdfUploader />
    </div>
  );
}
