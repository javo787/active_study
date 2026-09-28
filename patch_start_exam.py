with open("src/app/exam/ExamClient.tsx", "r") as f:
    content = f.read()

import re

old_start_logic = """      const variantsList = variantsSnapshot.docs;
      const randomVariant = variantsList[Math.floor(Math.random() * variantsList.length)];
      const variantId = randomVariant.id;

      const qSnapshot = await getDocs(collection(db, `exams/${exam.id}/variants/${variantId}/questions`));
      if (qSnapshot.empty) {
        toast.error('No questions in this variant.');
        setIsStarting(false);
        return;
      }

      const loadedQuestions = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));"""

new_start_logic = """      const variantsList = variantsSnapshot.docs;

      // Shuffle variants to pick one randomly
      const shuffledVariants = [...variantsList].sort(() => Math.random() - 0.5);

      let loadedQuestions: Question[] = [];
      let variantId = '';

      for (const variant of shuffledVariants) {
         const qSnapshot = await getDocs(collection(db, `exams/${exam.id}/variants/${variant.id}/questions`));
         if (!qSnapshot.empty) {
            loadedQuestions = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
            variantId = variant.id;
            break;
         }
      }

      if (loadedQuestions.length === 0) {
         toast.error('No questions found in any variant of this exam.');
         setIsStarting(false);
         return;
      }"""

content = content.replace(old_start_logic, new_start_logic)

old_error_logic = """    } catch (err) {
      console.error(err);
      toast.error('Failed to start exam');
    } finally {"""

new_error_logic = """    } catch (err: any) {
      console.error(err);
      if (err?.code === 'permission-denied') {
        toast.error('This exam is not available yet. Ask your teacher.');
      } else {
        toast.error('Failed to start exam');
      }
    } finally {"""

content = content.replace(old_error_logic, new_error_logic)

with open("src/app/exam/ExamClient.tsx", "w") as f:
    f.write(content)
