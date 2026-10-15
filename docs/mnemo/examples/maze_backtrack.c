// maze_backtrack.c — a maze solver with backtracking, animated with printf:
// at every step it clears the screen (\033[2J) and redraws the grid with the
// current path, so you can watch the path advance and retreat from dead ends.
//
// Legend:   '#' wall           (space) free cell
//           '@' current path   'x' abandoned cell (dead end)
//           'G' goal (bottom right); the start is top left.
//
// Iterative DFS with an explicit path stack (`sy`/`sx`). Backtracking uses
// try/rollback for the TENTATIVE move to each neighbour:
//
//   try (ok == 1) {                 // ok is evaluated AFTER the body
//       prev = grid[ny][nx];        // remember what was there
//       grid[ny][nx] = '@';         // claim the cell
//       sy[top]=ny; sx[top]=nx; top++;   // push it on the stack
//       ok = (prev == ' ');         // commit only if it was FREE
//   } rollback { }                  // if not free: the marking and the push
//                                   //   are undone by the automatic inversion
//
// When the cell was free (prev==' ') the condition `ok==1` is true → the move
// stays (commit). When the neighbour is a wall or already visited the condition
// is false → the rollback UNDOES the '@' marking and the push by itself: no
// manual restore. When no direction leads anywhere from a cell it is a dead end:
// it is popped from the stack and marked 'x' (so it is not tried again), and the
// next frame shows the path getting shorter.
//
// mnemo-main-argc: 0

#include <stdio.h>

#define H 7
#define W 9

char grid[H][W];

int dy[4] = {-1, 1, 0, 0};   // up, down, left, right
int dx[4] = {0, 0, -1, 1};

int sy[H * W], sx[H * W];     // path stack (pairs of cells)
int top = 0;

int gy = H - 1;              // goal at the bottom right
int gx = W - 1;
int frame = 0;

void draw(void) {
    printf("\033[2J\033[H");                         // clear screen + home
    printf("maze backtracking  frame=%d  path-len=%d\n\n", frame, top);
    for (int y = 0; y < H; y++) {
        for (int x = 0; x < W; x++) {
            char ch = grid[y][x];
            if (y == gy && x == gx && ch == ' ')     // show the goal until
                ch = 'G';                            //   it is reached
            putchar(ch);
        }
        putchar('\n');
    }
}

int main(void) {
    const char *rows[H] = {
        "         ",
        " ### ### ",
        " #   #   ",
        " # ### # ",
        "   #   # ",
        " # # # # ",
        " #   #   ",
    };
    for (int y = 0; y < H; y++)
        for (int x = 0; x < W; x++)
            grid[y][x] = rows[y][x];

    sy[0] = 0; sx[0] = 0; top = 1;
    grid[0][0] = '@';                                // mark the start
    frame = 0;
    draw();

    int done = 0;
    for (int step = 0; step < 400 && !done; step++) {
        int cy = sy[top - 1], cx = sx[top - 1];      // head of the path
        if (cy == gy && cx == gx) {
            done = 1;
        } else {
            int advanced = 0;
            for (int d = 0; d < 4 && !advanced; d++) {
                int ny = cy + dy[d], nx = cx + dx[d];
                int inb = (ny >= 0 && ny < H && nx >= 0 && nx < W);
                if (inb && grid[ny][nx] != '#') {
                    int ok = 0;
                    try (ok == 1) {
                        char prev = grid[ny][nx];
                        grid[ny][nx] = '@';
                        sy[top] = ny; sx[top] = nx; top += 1;
                        ok = (prev == ' ');          // commit only if free
                    } rollback {
                        // neighbour already visited ('@'/'x'): marking and push
                        // undone by the inversion → try the next direction
                    }
                    if (ok) advanced = 1;
                }
            }
            if (!advanced) {                         // dead end: backtrack
                top -= 1;
                grid[cy][cx] = 'x';
            }
            frame += 1;
            draw();
        }
    }

    if (done)
        printf("\nSOLVED  path-len=%d\n", top);
    else
        printf("\nNO PATH\n");
    return top;
}
