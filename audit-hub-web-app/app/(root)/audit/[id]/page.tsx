import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs";

import Comment from "@/components/forms/Comment";
import AuditCard from "@/components/cards/AuditCard";

import { fetchUser } from "@/lib/actions/user.actions";
import { fetchAuditById } from "@/lib/actions/audit.actions";

export const revalidate = 0;

async function page({ params }: { params: { id: string } }) {
  if (!params.id) return null;

  const user = await currentUser();
  if (!user) return null;

  const userInfo = await fetchUser(user.id);
  if (!userInfo?.onboarded) redirect("/onboarding");

  const audit = await fetchAuditById(params.id);

  return (
    <section className='relative'>
      <div>
        <AuditCard
          id={audit._id}
          currentUserId={user.id}
          parentId={audit.parentId}
          content={audit.text}
          author={audit.author}
          community={audit.community}
          createdAt={audit.createdAt}
          comments={audit.children}
        />
      </div>

      <div className='mt-7'>
        <Comment
          auditId={params.id}
          currentUserImg={user.imageUrl}
          currentUserId={JSON.stringify(userInfo._id)}
        />
      </div>

      <div className='mt-10'>
        {audit.children.map((childItem: any) => (
          <AuditCard
            key={childItem._id}
            id={childItem._id}
            currentUserId={user.id}
            parentId={childItem.parentId}
            content={childItem.text}
            author={childItem.author}
            community={childItem.community}
            createdAt={childItem.createdAt}
            comments={childItem.children}
            isComment
          />
        ))}
      </div>
    </section>
  );
}

export default page;
