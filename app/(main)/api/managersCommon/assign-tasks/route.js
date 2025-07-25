import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignedTasks, assignedTaskStatus, users, sprints } from "@/lib/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

// =================== GET ===================
export async function GET(req) {
  const session = await auth();
  if (!session || !["admin", "team_manager"].includes(session.user?.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let query = db
      .select({
        id: assignedTasks.id,
        title: assignedTasks.title,
        description: assignedTasks.description,
        taskType: assignedTasks.taskType,
        createdBy: assignedTasks.createdBy,
        createdAt: assignedTasks.createdAt,
        deadline: assignedTasks.deadline,
        resources: assignedTasks.resources,
        assignees: sql`json_agg(
          json_build_object(
            'id', ${users.id},
            'name', ${users.name},
            'email', ${users.email},
            'status', ${assignedTaskStatus.status}
          )
        )`.as("assignees"),
        sprints: sql`json_agg(
          json_build_object(
            'id', ${sprints.id},
            'title', ${sprints.title},
            'description', ${sprints.description},
            'status', ${sprints.status}
          )
        ) FILTER (WHERE ${sprints.id} IS NOT NULL)`.as("sprints"),
      })
      .from(assignedTasks)
      .leftJoin(assignedTaskStatus, eq(assignedTaskStatus.taskId, assignedTasks.id))
      .leftJoin(users, eq(assignedTaskStatus.memberId, users.id))
      .leftJoin(sprints, eq(sprints.taskStatusId, assignedTaskStatus.id))
      .groupBy(assignedTasks.id);

    const tasks = await query;

    const formattedTasks = tasks
      .map((task) => {
        const assignees = Array.isArray(task.assignees) ? task.assignees.filter((a) => a.id !== null) : [];
        const sprints = Array.isArray(task.sprints) ? task.sprints : [];
        let status = "not_started";
        if (sprints.length > 0) {
          const sprintStatuses = sprints.map((s) => s.status);
          if (sprintStatuses.every((s) => s === "verified" || s === "done")) {
            status = "done";
          } else if (sprintStatuses.some((s) => s === "in_progress" || s === "pending_verification")) {
            status = "in_progress";
          }
        } else {
          const assigneeStatuses = assignees.map((a) => a.status).filter(Boolean);
          if (assigneeStatuses.length > 0) {
            if (assigneeStatuses.every((s) => s === "done" || s === "verified")) {
              status = "done";
            } else if (assigneeStatuses.some((s) => s === "in_progress" || s === "pending_verification")) {
              status = "in_progress";
            }
          }
        }
        return {
          ...task,
          status,
          assignees: assignees.map(({ status, ...rest }) => rest),
          sprints,
        };
      })
      .filter((task) => task.assignees.length > 0);

    return NextResponse.json(
      { assignedTasks: formattedTasks },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error("Error fetching assigned tasks:", error);
    return NextResponse.json({ error: "Failed to fetch assigned tasks" }, { status: 500 });
  }
}

// =================== POST ===================
export async function POST(req) {
  const session = await auth();
  if (!session || !["admin", "team_manager"].includes(session.user?.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, description, taskType, createdBy, assignees, deadline, resources } = await req.json();

    if (!title || !assignees || assignees.length === 0) {
      return NextResponse.json({ error: "Title and at least one assignee are required" }, { status: 400 });
    }

    const parsedAssignees = assignees.map((id) => parseInt(id));
    let query = db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, parsedAssignees));

    if (session.user.role === "team_manager" && session.user.team_manager_type) {
      query = query.where(eq(users.team_manager_type, session.user.team_manager_type));
    }

    const validAssignees = await query;

    if (validAssignees.length !== parsedAssignees.length) {
      return NextResponse.json({ error: "One or more assignees are invalid or not accessible" }, { status: 400 });
    }

    // Insert new task
    const [newTask] = await db
      .insert(assignedTasks)
      .values({
        title,
        description: description || null,
        taskType: taskType || "assigned",
        createdBy: parseInt(createdBy),
        createdAt: new Date(),
        deadline: deadline ? new Date(deadline) : null,
        resources: resources || null,
      })
      .returning({ id: assignedTasks.id });

    // Insert assigned statuses
    const statusInserts = parsedAssignees.map((memberId) => ({
      taskId: newTask.id,
      memberId,
      status: "not_started",
      assignedDate: new Date(),
      updatedAt: new Date(),
    }));

    await db.insert(assignedTaskStatus).values(statusInserts);

    return NextResponse.json({ taskId: newTask.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ error: `Failed to create task: ${error.message}` }, { status: 500 });
  }
}