"use server";

import { revalidatePath } from "next/cache";

import { connectToDB } from "../mongoose";

import User from "../models/user.model";
import Audit from "../models/audit.model";
import Community from "../models/community.model";

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  connectToDB();

  // Calculate the number of posts to skip based on the page number and page size.
  const skipAmount = (pageNumber - 1) * pageSize;

  // Create a query to fetch the posts that have no parent (top-level audits) (a audit that is not a comment/reply).
  const postsQuery = Audit.find({ parentId: { $in: [null, undefined] } })
    .sort({ createdAt: "desc" })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({
      path: "author",
      model: User,
    })
    .populate({
      path: "community",
      model: Community,
    })
    .populate({
      path: "children", // Populate the children field
      populate: {
        path: "author", // Populate the author field within children
        model: User,
        select: "_id name parentId image", // Select only _id and username fields of the author
      },
    });

  // Count the total number of top-level posts (audits) i.e., audits that are not comments.
  const totalPostsCount = await Audit.countDocuments({
    parentId: { $in: [null, undefined] },
  }); // Get the total count of posts

  const posts = await postsQuery.exec();

  const isNext = totalPostsCount > skipAmount + posts.length;

  return { posts, isNext };
}

interface Params {
  text: string,
  author: string,
  communityId: string | null,
  path: string,
}

export async function createAudit({ text, author, communityId, path }: Params
) {
  try {
    connectToDB();

    const communityIdObject = await Community.findOne(
      { id: communityId },
      { _id: 1 }
    );

    const createdAudit = await Audit.create({
      text,
      author,
      community: communityIdObject, // Assign communityId if provided, or leave it null for personal account
    });

    // Update User model
    await User.findByIdAndUpdate(author, {
      $push: { audits: createdAudit._id },
    });

    if (communityIdObject) {
      // Update Community model
      await Community.findByIdAndUpdate(communityIdObject, {
        $push: { audits: createdAudit._id },
      });
    }

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to create audit: ${error.message}`);
  }
}

async function fetchAllChildAudits(auditId: string): Promise<any[]> {
  const childAudits = await Audit.find({ parentId: auditId });

  const descendantAudits = [];
  for (const childAudit of childAudits) {
    const descendants = await fetchAllChildAudits(childAudit._id);
    descendantAudits.push(childAudit, ...descendants);
  }

  return descendantAudits;
}

export async function deleteAudit(id: string, path: string): Promise<void> {
  try {
    connectToDB();

    // Find the audit to be deleted (the main audit)
    const mainAudit = await Audit.findById(id).populate("author community");

    if (!mainAudit) {
      throw new Error("Audit not found");
    }

    // Fetch all child audits and their descendants recursively
    const descendantAudits = await fetchAllChildAudits(id);

    // Get all descendant audit IDs including the main audit ID and child audit IDs
    const descendantAuditIds = [
      id,
      ...descendantAudits.map((audit) => audit._id),
    ];

    // Extract the authorIds and communityIds to update User and Community models respectively
    const uniqueAuthorIds = new Set(
      [
        ...descendantAudits.map((audit) => audit.author?._id?.toString()), // Use optional chaining to handle possible undefined values
        mainAudit.author?._id?.toString(),
      ].filter((id) => id !== undefined)
    );

    const uniqueCommunityIds = new Set(
      [
        ...descendantAudits.map((audit) => audit.community?._id?.toString()), // Use optional chaining to handle possible undefined values
        mainAudit.community?._id?.toString(),
      ].filter((id) => id !== undefined)
    );

    // Recursively delete child audits and their descendants
    await Audit.deleteMany({ _id: { $in: descendantAuditIds } });

    // Update User model
    await User.updateMany(
      { _id: { $in: Array.from(uniqueAuthorIds) } },
      { $pull: { audits: { $in: descendantAuditIds } } }
    );

    // Update Community model
    await Community.updateMany(
      { _id: { $in: Array.from(uniqueCommunityIds) } },
      { $pull: { audits: { $in: descendantAuditIds } } }
    );

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to delete audit: ${error.message}`);
  }
}

export async function fetchAuditById(auditId: string) {
  connectToDB();

  try {
    const audit = await Audit.findById(auditId)
      .populate({
        path: "author",
        model: User,
        select: "_id id name image",
      }) // Populate the author field with _id and username
      .populate({
        path: "community",
        model: Community,
        select: "_id id name image",
      }) // Populate the community field with _id and name
      .populate({
        path: "children", // Populate the children field
        populate: [
          {
            path: "author", // Populate the author field within children
            model: User,
            select: "_id id name parentId image", // Select only _id and username fields of the author
          },
          {
            path: "children", // Populate the children field within children
            model: Audit, // The model of the nested children (assuming it's the same "Audit" model)
            populate: {
              path: "author", // Populate the author field within nested children
              model: User,
              select: "_id id name parentId image", // Select only _id and username fields of the author
            },
          },
        ],
      })
      .exec();

    return audit;
  } catch (err) {
    console.error("Error while fetching audit:", err);
    throw new Error("Unable to fetch audit");
  }
}

export async function addCommentToAudit(
  auditId: string,
  commentText: string,
  userId: string,
  path: string
) {
  connectToDB();

  try {
    // Find the original audit by its ID
    const originalAudit = await Audit.findById(auditId);

    if (!originalAudit) {
      throw new Error("Audit not found");
    }

    // Create the new comment audit
    const commentAudit = new Audit({
      text: commentText,
      author: userId,
      parentId: auditId, // Set the parentId to the original audit's ID
    });

    // Save the comment audit to the database
    const savedCommentAudit = await commentAudit.save();

    // Add the comment audit's ID to the original audit's children array
    originalAudit.children.push(savedCommentAudit._id);

    // Save the updated original audit to the database
    await originalAudit.save();

    revalidatePath(path);
  } catch (err) {
    console.error("Error while adding comment:", err);
    throw new Error("Unable to add comment");
  }
}
