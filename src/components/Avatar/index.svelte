<script lang="typescript">
  export let avatar: string; //"elephant" | "giraffe" | "monkey" | "rabbit" | "ghost"
</script>

<style>
  .elephant {
    background-image: url("./avatars/elephant.svg");
  }

  .giraffe {
    background-image: url("./avatars/giraffe.svg");
  }

  .monkey {
    background-image: url("./avatars/monkey.svg");
  }

  .rabbit {
    background-image: url("./avatars/rabbit.svg");
  }

  .ghost {
    background-image: url("./avatars/ghost.svg");
  }
</style>

<span class="h-full w-full bg-cover inline-block {avatar || 'ghost'}"></span>
