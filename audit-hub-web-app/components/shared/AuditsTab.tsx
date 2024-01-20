import { redirect } from "next/navigation";

import { fetchCommunityPosts } from "@/lib/actions/community.actions";
import { fetchUserPosts } from "@/lib/actions/user.actions";

import AuditCard from "../cards/AuditCard";

interface Result {
  name: string;
  image: string;
  id: string;
  audits: {
    _id: string;
    text: string;
    parentId: string | null;
    author: {
      name: string;
      image: string;
      id: string;
    };
    community: {
      id: string;
      name: string;
      image: string;
    } | null;
    createdAt: string;
    children: {
      author: {
        image: string;
      };
    }[];
  }[];
}

interface Props {
  currentUserId: string;
  accountId: string;
  accountType: string;
}

async function AuditsTab({ currentUserId, accountId, accountType }: Props) {
  let result: Result;

  if (accountType === "Community") {
    result = await fetchCommunityPosts(accountId);
  } else {
    result = await fetchUserPosts(accountId);
  }

  if (!result) {
    redirect("/");
  }

  return (
    <section className='mt-9 flex flex-col gap-10'>
      {result.audits.map((audit) => (
        <AuditCard
          key={audit._id}
          id={audit._id}
          currentUserId={currentUserId}
          parentId={audit.parentId}
          content={audit.text}
          author={
            accountType === "User"
              ? { name: result.name, image: result.image, id: result.id }
              : {
                  name: audit.author.name,
                  image: audit.author.image,
                  id: audit.author.id,
                }
          }
          community={
            accountType === "Community"
              ? { name: result.name, id: result.id, image: result.image }
              : audit.community
          }
          createdAt={audit.createdAt}
          comments={audit.children}
        />
      ))}
    </section>
  );
}

export default AuditsTab;
