import { useCallback, useMemo } from 'react';
import { isImage, isPdf } from '../lib/images';
import { supabase } from '../lib/supabase';
import type { Tag, TagColor, Task, TaskRow } from '../lib/types';
import { TAG_COLORS } from '../lib/types';
import { useData } from './data';

export type NewTask = Partial<Omit<TaskRow, 'id' | 'number'>> & { title: string };

/** Higher-level operations on tasks and their related rows. */
export function useActions() {
  const { db, insert, update, remove, taskById } = useData();

  const ensureTags = useCallback(async (names: string[]): Promise<Tag[]> => {
    const out: Tag[] = [];
    for (const raw of names) {
      const name = raw.trim().toLowerCase();
      if (!name) continue;
      const existing = db.tags.find((t) => t.name.toLowerCase() === name);
      if (existing) { out.push(existing); continue; }
      const color = TAG_COLORS[(db.tags.length + out.length + 1) % TAG_COLORS.length] as TagColor;
      const [created] = await insert('tags', { name, color });
      out.push(created);
    }
    return out;
  }, [db.tags, insert]);

  const createTask = useCallback(async (fields: NewTask, opts: { assignees?: string[]; tagIds?: string[]; tagNames?: string[] } = {}) => {
    const [row] = await insert('tasks', fields);
    const tagIds = [...(opts.tagIds ?? []), ...(await ensureTags(opts.tagNames ?? [])).map((t) => t.id)];
    if (opts.assignees?.length) await insert('task_assignees', opts.assignees.map((user_id) => ({ task_id: row.id, user_id })));
    if (tagIds.length) await insert('task_tags', [...new Set(tagIds)].map((tag_id) => ({ task_id: row.id, tag_id })));
    return row;
  }, [insert, ensureTags]);

  const updateTask = useCallback((id: string, patch: Partial<TaskRow>) => update('tasks', { id }, patch), [update]);

  const deleteTask = useCallback(async (id: string) => {
    const atts = db.attachments.filter((a) => a.task_id === id);
    if (atts.length) await supabase.storage.from('attachments').remove(atts.map((a) => a.path));
    await remove('tasks', { id });
  }, [db.attachments, remove]);

  const duplicateTask = useCallback(async (t: Task) => {
    const { id: _id, number: _n, created_at: _c, updated_at: _u, completed_at: _d, created_by: _cb, updated_by: _ub,
      assignees, tags, subtasks, blockedBy: _b, blocked: _bl, urgency: _ur, ...rest } = t;
    const row = await createTask({ ...rest, title: `${t.title} (copy)`, status: 'To do' }, { assignees, tagIds: tags });
    if (subtasks.length) await insert('subtasks', subtasks.map((s) => ({ task_id: row.id, title: s.title, position: s.position })));
    return row;
  }, [createTask, insert]);

  const toggleAssignee = useCallback(async (taskId: string, userId: string) => {
    const t = taskById.get(taskId);
    if (!t) return;
    if (t.assignees.includes(userId)) await remove('task_assignees', { task_id: taskId, user_id: userId });
    else await insert('task_assignees', { task_id: taskId, user_id: userId });
  }, [taskById, insert, remove]);

  const toggleTag = useCallback(async (taskId: string, tagId: string) => {
    const t = taskById.get(taskId);
    if (!t) return;
    if (t.tags.includes(tagId)) await remove('task_tags', { task_id: taskId, tag_id: tagId });
    else await insert('task_tags', { task_id: taskId, tag_id: tagId });
  }, [taskById, insert, remove]);

  const addTagByName = useCallback(async (taskId: string, name: string) => {
    const [tag] = await ensureTags([name]);
    const t = taskById.get(taskId);
    if (tag && t && !t.tags.includes(tag.id)) await insert('task_tags', { task_id: taskId, tag_id: tag.id });
  }, [ensureTags, taskById, insert]);

  /** Upload a PDF or an (already compressed) image. */
  const uploadPdf = useCallback(async (file: File, owner: { task_id?: string; meeting_id?: string }) => {
    const pdf = isPdf(file);
    if (!pdf && !isImage(file)) throw new Error('Only PDFs and images can be attached.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Files must be 10 MB or smaller.');
    const safe = file.name.replace(/[^\w.\- ]+/g, '_');
    const path = `${owner.task_id ?? owner.meeting_id}/${crypto.randomUUID()}-${safe}`;
    const contentType = pdf ? 'application/pdf' : file.type || 'image/webp';
    const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType });
    if (error) throw error;
    await insert('attachments', { ...owner, name: file.name, size: file.size, path });
  }, [insert]);

  const openAttachment = useCallback(async (path: string, download = false) => {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 120, download ? { download: true } : undefined);
    if (error) throw error;
    window.open(data.signedUrl, '_blank', 'noopener');
  }, []);

  const deleteAttachment = useCallback(async (id: string, path: string) => {
    await supabase.storage.from('attachments').remove([path]);
    await remove('attachments', { id });
  }, [remove]);

  return useMemo(() => ({
    createTask, updateTask, deleteTask, duplicateTask, toggleAssignee, toggleTag, addTagByName, ensureTags,
    uploadPdf, openAttachment, deleteAttachment,
  }), [createTask, updateTask, deleteTask, duplicateTask, toggleAssignee, toggleTag, addTagByName, ensureTags,
    uploadPdf, openAttachment, deleteAttachment]);
}
